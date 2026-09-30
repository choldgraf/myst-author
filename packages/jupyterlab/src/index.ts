import type { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette, MainAreaWidget } from '@jupyterlab/apputils';
import { Compartment } from '@codemirror/state';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { PageConfig, PathExt, URLExt } from '@jupyterlab/coreutils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import type { IDocumentWidget } from '@jupyterlab/docregistry';
import { IEditorTracker, type FileEditor } from '@jupyterlab/fileeditor';
import { INotebookTracker, type NotebookPanel } from '@jupyterlab/notebook';
import { Signal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import { connectLsp } from '@myst-author/lsp/client';
import { findLabel } from '@myst-author/lsp/labels';
import { contentServer, sha256 } from '@myst-author/mystmd/built';
import { PreviewController } from '@myst-author/preview/controller';
import { livePreview, showBuilt } from '@myst-author/preview/live';
import liveCss from '../dist/live.css'; // the preview's CSS, for live blocks' shadow roots (see build.mjs)

type Editor = IDocumentWidget<FileEditor>;
type Lsp = ReturnType<typeof connectLsp>;

// The MyST Author server, which jupyter-server-proxy runs at <base>/myst-author/ (see binder/jupyter_server_config.py).
const server = URLExt.join(PageConfig.getBaseUrl(), 'myst-author/');
const serverOrigin = new URL(server, location.href).origin;
// Jupyter's root folder as a file:// URI (set by jupyter-lsp, which ships with JupyterLab), to map Lab paths to document URIs.
// The server's `/lsp` bridge starts the language server with the project folder, which overrides this root.
const jupyterRoot = PageConfig.getOption('rootUri').replace(/\/$/, '');

const content = contentServer(server + 'myst');
// Live preview in Markdown editors and notebook Markdown cells. Blocks render in shadow roots, so the preview's CSS can't restyle Lab.
// Blocks read at Lab's content size, like its rendered Markdown, rather than the preview's 16px.
const live = livePreview({ css: `${liveCss}\n.article { font-size: var(--jp-content-font-size1); line-height: var(--jp-content-line-height) }` });
const liveMode = new Compartment();
let liveOn = true;

const isMarkdown = (w: Editor | null): w is Editor => !!w && w.context.path.endsWith('.md');
const cm = (w: Editor) => w.content.editor as CodeMirrorEditor;

/** The (1-based) line at the top of the editor's viewport. */
function topLine(w: Editor) {
  const view = cm(w).editor;
  return view.state.doc.lineAt(view.lineBlockAtHeight(view.scrollDOM.scrollTop).from).number;
}

/** Open the notebook at `path` and edit its cell `id`, returning the cell's CodeMirror view. */
async function editCell(docs: IDocumentManager, path: string, id: string) {
  const nb = docs.openOrReveal(path) as NotebookPanel | undefined;
  await nb?.context.ready;
  const i = nb?.content.widgets.findIndex((c) => c.model.id === id) ?? -1;
  if (!nb || i < 0) return null;
  nb.content.activeCellIndex = i;
  nb.content.mode = 'edit'; // shows a Markdown cell's source
  await nb.content.scrollToItem(i);
  const cell = nb.content.widgets[i];
  await cell.ready;
  return (cell.editor as CodeMirrorEditor).editor;
}

/** Open `path` in Lab and put the cursor on (0-based) `line`. Notebooks just open. */
async function show(docs: IDocumentManager, path: string, line: number) {
  const w = docs.openOrReveal(path) as Editor | undefined;
  await w?.context.ready;
  w?.content.editor?.setCursorPosition({ line, column: 0 });
  w?.content.editor?.revealPosition({ line, column: 0 });
  w?.content.editor?.focus();
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: '@myst-author/jupyterlab:plugin',
  description: 'MyST reference intelligence and live preview.',
  autoStart: true,
  requires: [IEditorTracker, IDocumentManager, INotebookTracker],
  optional: [ICommandPalette],
  activate: (app: JupyterFrontEnd, tracker: IEditorTracker, docs: IDocumentManager, notebooks: INotebookTracker, palette: ICommandPalette | null) => {
    // Without rootUri, document URIs would be wrong, so skip the language features. The preview still works.
    const lsp = jupyterRoot ? Promise.resolve(connectLsp(server + 'lsp', jupyterRoot)) : Promise.reject(new Error("jupyter-lsp didn't set rootUri"));
    lsp.then((l) => {
      // Go to definition in another file or notebook cell: open it in Lab, then hand lsp-client its editor.
      l.client.workspace.displayFile = async (uri) => {
        const [file, cell] = uri.split('#');
        const path = l.path(file);
        if (path == null) return null;
        if (cell) return editCell(docs, path, cell);
        const w = docs.openOrReveal(path) as Editor | undefined;
        await w?.context.ready;
        return w ? cm(w).editor : null;
      };
    }, (err) => console.warn(`MyST Author: no language features from ${server} (${err})`));
    // The project folder, relative to Jupyter's root.
    const project = Promise.all([lsp, fetch(server + 'api/root').then((r) => r.json())]).then(([l, { uri }]) => l.path(uri) ?? '', () => '');

    // Live preview, and the language client once it connects. `uri` is the editor's document URI.
    const attachEditor = (editor: CodeMirrorEditor, uri: (l: Lsp) => string) => {
      editor.injectExtension(liveMode.of(liveOn ? live : []));
      lsp.then((l) => editor.injectExtension(l.client.plugin(uri(l), 'markdown')), () => {});
    };

    // Live blocks render mystmd's build when it matches the text, which resolves embeds and references to other pages.
    const sendBuilt = async (w: Editor) => {
      const text = w.content.model.sharedModel.getSource();
      const { page } = await content.built(PathExt.relative(await project, w.context.path));
      if (page && page.sha256 === (await sha256(text))) cm(w).editor.dispatch({ effects: showBuilt.of({ page, text }) });
    };

    const attach = async (w: Editor) => {
      if (!isMarkdown(w)) return;
      attachEditor(cm(w), (l) => l.uri(w.context.path));
      await w.context.ready;
      sendBuilt(w);
    };
    tracker.forEach(attach);
    tracker.widgetAdded.connect((_, w) => attach(w));

    // Each Markdown cell is a document `<notebook URI>#<cell id>`.
    // Attach to every cell, not just the one being edited: once a notebook has open cells, the server only knows their labels.
    // ponytail: a cell is attached once it first renders, so with Lab's `full` windowing mode, off-screen cells wait until they're scrolled to.
    const attached = new WeakSet<object>();
    const attachCells = (nb: NotebookPanel) =>
      Promise.all(nb.content.widgets.map(async (cell) => {
        if (cell.model.type !== 'markdown' || attached.has(cell)) return false;
        attached.add(cell);
        await cell.ready;
        attachEditor(cell.editor as CodeMirrorEditor, (l) => `${l.uri(nb.context.path)}#${cell.model.id}`);
        return true;
      })).then((added) => added.includes(true) && sendBuiltCells(nb));

    // A notebook's build has one block per cell, and no hash to compare with, so cells use it while the notebook is saved: that's what mystmd built.
    const sendBuiltCells = async (nb: NotebookPanel) => {
      const { page } = await content.built(PathExt.relative(await project, nb.context.path));
      const blocks = page?.mdast.children ?? [];
      if (!page || nb.context.model.dirty || blocks.length !== nb.content.widgets.length) return;
      nb.content.widgets.forEach((cell, i) => {
        if (!attached.has(cell) || !cell.editor) return;
        const cellPage = { ...page, mdast: { type: 'root', children: blocks[i].children ?? [] } };
        (cell.editor as CodeMirrorEditor).editor.dispatch({ effects: showBuilt.of({ page: cellPage, text: cell.model.sharedModel.getSource() }) });
      });
    };
    content.watch(() => {
      tracker.forEach((w) => isMarkdown(w) && sendBuilt(w));
      notebooks.forEach(sendBuiltCells);
    });
    const watch = (nb: NotebookPanel) =>
      nb.context.ready.then(() => {
        attachCells(nb);
        // Changing a cell's type replaces its widget, so this also catches cells that become Markdown.
        nb.content.model?.cells.changed.connect(() => attachCells(nb));
        // Cell widgets can appear after the notebook is ready; a cell is always active before it's edited.
        nb.content.activeCellChanged.connect(() => attachCells(nb));
      });
    notebooks.forEach(watch);
    notebooks.widgetAdded.connect((_, nb) => watch(nb));

    const toggleLive = 'myst-author:toggle-live-preview';
    app.commands.addCommand(toggleLive, {
      label: 'MyST: Live Preview',
      isToggled: () => liveOn,
      execute: () => {
        liveOn = !liveOn;
        const effects = liveMode.reconfigure(liveOn ? live : []);
        tracker.forEach((w) => isMarkdown(w) && cm(w).editor.dispatch({ effects }));
        notebooks.forEach((nb) => nb.content.widgets.forEach((cell) => attached.has(cell) && (cell.editor as CodeMirrorEditor | null)?.editor.dispatch({ effects })));
      },
    });
    palette?.addItem({ command: toggleLive, category: 'MyST' });

    let preview: MainAreaWidget<MystPreview> | undefined;
    const command = 'myst-author:open-preview';
    app.commands.addCommand(command, {
      label: 'MyST: Open Preview to the Side',
      execute: () => {
        if (preview && !preview.isDisposed) return app.shell.activateById(preview.id);
        preview = new MainAreaWidget({ content: new MystPreview(tracker, docs, lsp, project) });
        preview.id = 'myst-author-preview';
        app.shell.add(preview, 'main', { mode: 'split-right', ref: tracker.currentWidget?.id });
      },
    });
    palette?.addItem({ command, category: 'MyST' });
    app.contextMenu.addItem({ command, selector: '.jp-FileEditor', rank: 0 });
  },
};

/** The shared preview page (served by the MyST Author server) in an iframe, following the current Markdown editor. */
class MystPreview extends Widget {
  private iframe = document.createElement('iframe');
  private editor: Editor | null = null;
  private preview = new PreviewController({
    current: async () => {
      const w = this.editor;
      return w ? { path: PathExt.relative(await this.project, w.context.path), text: w.content.model.sharedModel.getSource(), dirty: w.context.model.dirty, line: topLine(w) } : undefined;
    },
    post: (m) => this.iframe.contentWindow?.postMessage(m, serverOrigin),
    open: async (path, line) => show(this.docs, PathExt.join(await this.project, path), line),
    openExternal: (url) => void window.open(url, '_blank', 'noopener'),
    findLabel: async (id) => {
      const l = await this.lsp;
      const s = await findLabel((method, params) => l.client.request(method, params), id);
      const path = s && l.path(s.uri.split('#')[0]); // a label in a notebook cell has `#<cell id>`
      return path != null ? { path: PathExt.relative(await this.project, path), line: s!.line } : undefined;
    },
    warn: (message) => console.warn(`MyST Author: ${message}`),
  }, Promise.resolve(content));

  constructor(private tracker: IEditorTracker, private docs: IDocumentManager, private lsp: Promise<Lsp>, private project: Promise<string>) {
    super();
    this.title.label = 'MyST Preview';
    this.title.closable = true;
    this.iframe.src = server + 'preview.html';
    this.iframe.style.cssText = 'width: 100%; height: 100%; border: 0';
    this.node.appendChild(this.iframe);
    window.addEventListener('message', this.onMessage);
    tracker.currentChanged.connect((_, w) => this.follow(w), this);
    this.follow(tracker.currentWidget);
  }

  dispose() {
    window.removeEventListener('message', this.onMessage);
    this.editor && cm(this.editor).editor.scrollDOM.removeEventListener('scroll', this.onScroll);
    this.preview.dispose();
    Signal.clearData(this);
    super.dispose();
  }

  // Focusing the preview leaves the tracker's current widget alone, so this only follows other Markdown editors.
  private follow(w: Editor | null) {
    if (!isMarkdown(w) || w === this.editor) return;
    if (this.editor) {
      this.editor.content.model.sharedModel.changed.disconnect(this.sendText, this);
      this.editor.context.model.stateChanged.disconnect(this.sendText, this);
      cm(this.editor).editor.scrollDOM.removeEventListener('scroll', this.onScroll);
    }
    this.editor = w;
    this.title.label = `MyST: ${PathExt.basename(w.context.path)}`;
    w.content.model.sharedModel.changed.connect(this.sendText, this);
    w.context.model.stateChanged.connect(this.sendText, this); // the dirty flag
    cm(w).editor.scrollDOM.addEventListener('scroll', this.onScroll);
    this.preview.sendFile();
  }

  private sendText() {
    this.preview.sendText();
  }

  private onScroll = () => this.editor && this.preview.scroll(topLine(this.editor));

  private onMessage = ({ source, data }: MessageEvent) => {
    if (source === this.iframe.contentWindow) this.preview.onMessage(data);
  };
}

export default plugin;
