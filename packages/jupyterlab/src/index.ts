import type { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette, MainAreaWidget } from '@jupyterlab/apputils';
import { Compartment } from '@codemirror/state';
import type { Cell } from '@jupyterlab/cells';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { PageConfig, PathExt, URLExt } from '@jupyterlab/coreutils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import type { IDocumentWidget } from '@jupyterlab/docregistry';
import { IEditorTracker, type FileEditor } from '@jupyterlab/fileeditor';
import { INotebookTracker, type NotebookPanel } from '@jupyterlab/notebook';
import { Signal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import { connectLsp, type Lsp } from '@myst-author/lsp-client/client';
import { contentServer } from 'mystmd-client/content-server';
import { Preview } from '@myst-author/preview';
import { findLabel, PreviewController, type ToPage } from '@myst-author/preview/controller';
import { livePreview, offerBuilt, shadowSheet, showBuilt, topLine } from '@myst-author/preview/live';
import { mountPreviewPage } from '@myst-author/preview/page';
import { cellPages, fromBuiltPage, parseMyst, type ParseResult } from '@myst-author/preview/parse';
// React comes with @myst-author/preview, which renders with it.
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import liveCss from '../dist/live.css'; // the preview's CSS, for the extension's shadow roots (see build.mjs)

type Editor = IDocumentWidget<FileEditor>;

// The host server, which jupyter-server-proxy runs at <base>/myst-author/ (see binder/jupyter_server_config.py).
const server = URLExt.join(PageConfig.getBaseUrl(), 'myst-author/');
// Jupyter's root folder as a file:// URI (set by jupyter-lsp, which ships with JupyterLab), to map Lab paths to document URIs.
// The server's `/lsp` bridge starts the language server with the project folder, which overrides this root.
const jupyterRoot = PageConfig.getOption('rootUri').replace(/\/$/, '');

const content = contentServer(server + 'myst');
// Live preview in Markdown editors and notebook Markdown cells. Blocks render in shadow roots, so the preview's CSS can't restyle Lab.
// Blocks read at Lab's content size, like its rendered Markdown, rather than the preview's 16px.
const cellCss = `${liveCss}\n.article { font-size: var(--jp-content-font-size1); line-height: var(--jp-content-line-height) }`;
const live = livePreview({ css: cellCss });
const liveMode = new Compartment();
let liveOn = true;
// The preview panel also renders in a shadow root.
// The inner div is the page's body, and scrolls. It has no top padding, so the badge bar sticks to its very top.
const previewCss = shadowSheet(`${liveCss}
:host > div { position: relative; box-sizing: border-box; height: 100%; overflow: auto; padding: 0 2rem 1rem; background: white; color: black }`);

// Rendered Markdown cells show mystmd's build in a shadow root on the cell's rendered widget (Lab's or jupyterlab-myst's), so references to other pages resolve.
// A cell whose text differs from the build shows the fast parse, as the live preview does, until mystmd rebuilds.
// An empty cell's shadow root holds just a <slot>, which shows that widget's own rendering (Lab's hint text) underneath.
// Trim the cell's outer margins, as Lab does for rendered Markdown.
const cellSheet = shadowSheet(`${cellCss}\n.article > :first-child > :first-child { margin-top: 0 } .article > :last-child > :last-child { margin-bottom: 0 }`);
const cellRoots = new WeakMap<HTMLElement, Root>();
// Each Markdown cell's build, and the cell's text it was built from: the cell shows it while its text is the same.
const cellBuilds = new WeakMap<Cell, { result: ParseResult; source: string }>();
const openExternal = (url: string) => void window.open(url, '_blank', 'noopener');
function showCell(cell: Cell) {
  const built = cellBuilds.get(cell);
  const source = cell.model.sharedModel.getSource();
  const result = built?.source === source ? built.result : source.trim() ? parseMyst(source) : undefined;
  const node = cell.inputArea?.renderedInput?.node;
  if (!node) return;
  let root = cellRoots.get(node);
  if (!root) {
    const shadow = node.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [cellSheet];
    cellRoots.set(node, (root = createRoot(shadow.appendChild(document.createElement('div')))));
  }
  // A click opens external links in a new tab, and other pages' links do nothing.
  const onFollowLink = (href: string) => /^[a-z][\w+.-]*:/i.test(href) && openExternal(href);
  root.render(result ? createElement(Preview, { result, onFollowLink }) : createElement('slot'));
}

const isMarkdown = (w: Editor | null): w is Editor => !!w && w.context.path.endsWith('.md');
const cm = (w: Editor) => w.content.editor as CodeMirrorEditor;

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

/** A left sidebar panel with the project's table of contents. Clicking a page opens it. The plugin's `watch` callback calls `refresh()`. */
class MystToc extends Widget {
  constructor(
    private docs: IDocumentManager,
    private project: Promise<string>,
  ) {
    super();
    this.id = 'myst-author-toc';
    this.title.label = 'MyST';
    this.title.caption = 'MyST TOC';
    this.addClass('myst-author-toc');
  }

  async refresh() {
    const [entries, root] = await Promise.all([content.toc().catch((err) => { console.warn(`MyST Author: no table of contents (${err})`); return []; }), this.project]);
    this.node.replaceChildren(
      ...entries.map(({ title, level, file }) => {
        const item = document.createElement(file ? 'button' : 'div');
        item.textContent = title;
        item.style.paddingLeft = `${level}em`;
        if (file) item.onclick = () => void this.docs.openOrReveal(PathExt.join(root, file));
        return item;
      }),
    );
  }
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: '@myst-author/jupyterlab:plugin',
  description: 'Cross-reference help and live preview for MyST.',
  autoStart: true,
  requires: [IEditorTracker, IDocumentManager, INotebookTracker],
  optional: [ICommandPalette],
  activate: (app: JupyterFrontEnd, tracker: IEditorTracker, docs: IDocumentManager, notebooks: INotebookTracker, palette: ICommandPalette | null) => {
    // Radix puts myst-theme's hover cards in <body>, outside the shadow roots, so they get the preview's CSS scoped to the card (`:root` becomes `:scope`).
    document.head.appendChild(document.createElement('style')).textContent = `@scope (.hover-card-content) { ${cellCss.replaceAll(':root', ':scope')} }`;
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

    const toc = new MystToc(docs, project);

    // Live preview, and the language client once it connects. `uri` is the editor's document URI.
    const attachEditor = (editor: CodeMirrorEditor, uri: (l: Lsp) => string) => {
      editor.injectExtension(liveMode.of(liveOn ? live : []));
      lsp.then((l) => editor.injectExtension(l.client.plugin(uri(l), 'markdown')), () => {});
    };

    // Live blocks render mystmd's build when it matches the text, which resolves embeds and references to other pages.
    const sendBuilt = async (w: Editor) => {
      const { page } = await content.built(PathExt.relative(await project, w.context.path));
      if (page) offerBuilt(cm(w).editor, page);
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
    // A cell is attached once it first renders, so with Lab's `full` windowing mode, off-screen cells wait until they're scrolled to.
    const attached = new WeakSet<object>();
    const attachCells = (nb: NotebookPanel) =>
      Promise.all(nb.content.widgets.map(async (cell) => {
        if (cell.model.type !== 'markdown' || attached.has(cell)) return false;
        attached.add(cell);
        await cell.ready;
        attachEditor(cell.editor as CodeMirrorEditor, (l) => `${l.uri(nb.context.path)}#${cell.model.id}`);
        // Lab adds the cell's rendered widget each time the cell renders, such as when you stop editing it, so check again then whether the build matches.
        new MutationObserver(() => showCell(cell)).observe(cell.inputArea!.node, { childList: true });
        return true;
      })).then((added) => { if (added.includes(true)) sendBuiltCells(nb); });

    // Cells use their block of the build while their text is as saved (see `cellPages`).
    // The notebook being clean isn't the test: starting a kernel changes its metadata, which marks it dirty.
    // Just after a save, a cell's saved text can be ahead of the build, and the cell shows its old block until mystmd rebuilds.
    const savedSources = new WeakMap<NotebookPanel, string[]>();
    const sendBuiltCells = async (nb: NotebookPanel) => {
      const { page } = await content.built(PathExt.relative(await project, nb.context.path));
      const sources = nb.content.widgets.map((cell) => cell.model.sharedModel.getSource());
      const pages = page ? cellPages(page, sources, savedSources.get(nb) ?? []) : [];
      nb.content.widgets.forEach((cell, i) => {
        const source = sources[i];
        const built = pages[i];
        if (cell.model.type === 'markdown') {
          const result = built && fromBuiltPage(built);
          if (result) cellBuilds.set(cell, { result, source });
          else cellBuilds.delete(cell);
          showCell(cell);
        }
        if (!built || !attached.has(cell) || !cell.editor) return;
        (cell.editor as CodeMirrorEditor).editor.dispatch({ effects: showBuilt.of({ page: built, text: source }) });
      });
    };
    content.watch(() => {
      tracker.forEach((w) => isMarkdown(w) && sendBuilt(w));
      notebooks.forEach(sendBuiltCells);
      toc.refresh();
    });
    const watch = (nb: NotebookPanel) =>
      nb.context.ready.then(() => {
        // Each cell's text as last loaded or saved, by position: added or moved cells show Lab's rendering until you save and mystmd rebuilds.
        const save = () => savedSources.set(nb, nb.context.model.sharedModel.cells.map((c) => c.getSource()));
        save();
        nb.context.fileChanged.connect(save);
        attachCells(nb);
        // Changing a cell's type replaces its widget, so this also catches cells that become Markdown.
        nb.content.model?.cells.changed.connect(() => attachCells(nb));
        // Cell widgets can appear after the notebook is ready, and a cell is always active before it's edited.
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

    app.shell.add(toc, 'left', { rank: 300 });
  },
};

/** The preview page (`@myst-author/preview/page`, as in VS Code) in a shadow root, following the current Markdown editor. */
class MystPreview extends Widget {
  private editor: Editor | null = null;
  private receive: (m: ToPage) => void = () => {};
  private root: ReturnType<typeof mountPreviewPage>;
  private preview = new PreviewController({
    current: async () => {
      const w = this.editor;
      return w ? { path: PathExt.relative(await this.project, w.context.path), text: w.content.model.sharedModel.getSource(), dirty: w.context.model.dirty, line: topLine(cm(w).editor) } : undefined;
    },
    post: (m) => this.receive(m),
    open: async (path, line) => show(this.docs, PathExt.join(await this.project, path), line),
    openExternal,
    findLabel: async (id) => {
      const l = await this.lsp;
      const s = await findLabel((method, params) => l.client.request(method, params), id);
      const path = s && l.path(s.uri.split('#')[0]); // a label in a notebook cell has `#<cell id>`
      return path != null ? { path: PathExt.relative(await this.project, path), line: s!.line } : undefined;
    },
    warn: (message) => console.warn(`MyST Author: ${message}`),
  }, Promise.resolve(content));

  constructor(tracker: IEditorTracker, private docs: IDocumentManager, private lsp: Promise<Lsp>, private project: Promise<string>) {
    super();
    this.title.label = 'MyST Preview';
    this.title.closable = true;
    const shadow = this.node.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [previewCss];
    this.root = mountPreviewPage(shadow.appendChild(document.createElement('div')), {
      postMessage: (m) => this.preview.onMessage(m),
      listen: (receive) => (this.receive = receive),
    });
    tracker.currentChanged.connect((_, w) => this.follow(w), this);
    this.follow(tracker.currentWidget);
  }

  dispose() {
    this.root.unmount();
    this.editor && cm(this.editor).editor.scrollDOM.removeEventListener('scroll', this.onScroll);
    this.preview.dispose();
    Signal.clearData(this);
    Signal.clearData(this.preview); // disconnects the editor's signals, which call the controller directly
    super.dispose();
  }

  // Focusing the preview leaves the tracker's current widget alone, so this only follows other Markdown editors.
  private follow(w: Editor | null) {
    if (!isMarkdown(w) || w === this.editor) return;
    if (this.editor) {
      this.editor.content.model.sharedModel.changed.disconnect(this.preview.sendText, this.preview);
      this.editor.context.model.stateChanged.disconnect(this.preview.sendText, this.preview);
      cm(this.editor).editor.scrollDOM.removeEventListener('scroll', this.onScroll);
    }
    this.editor = w;
    this.title.label = `MyST: ${PathExt.basename(w.context.path)}`;
    w.content.model.sharedModel.changed.connect(this.preview.sendText, this.preview);
    w.context.model.stateChanged.connect(this.preview.sendText, this.preview); // the dirty flag
    cm(w).editor.scrollDOM.addEventListener('scroll', this.onScroll);
    this.preview.sendFile();
  }

  private onScroll = () => this.editor && this.preview.scroll(topLine(cm(this.editor).editor));
}

export default plugin;
