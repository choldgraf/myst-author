import type { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ICommandPalette, MainAreaWidget } from '@jupyterlab/apputils';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { PageConfig, PathExt, URLExt } from '@jupyterlab/coreutils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import type { IDocumentWidget } from '@jupyterlab/docregistry';
import { IEditorTracker, type FileEditor } from '@jupyterlab/fileeditor';
import { Signal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import { connectLsp } from '@myst-author/lsp/client';
import { contentServer } from '@myst-author/preview/built';
import { PreviewController } from '@myst-author/preview/controller';

type Editor = IDocumentWidget<FileEditor>;
type Lsp = Awaited<ReturnType<typeof connectLsp>>;

// The MyST Author server, which jupyter-server-proxy runs at <base>/myst-author/ (see binder/jupyter_server_config.py).
const server = URLExt.join(PageConfig.getBaseUrl(), 'myst-author/');
const serverOrigin = new URL(server, location.href).origin;
// Jupyter's root folder as a file:// URI (set by jupyter-lsp, which ships with JupyterLab), to map Lab paths to document URIs.
const jupyterRoot = PageConfig.getOption('rootUri').replace(/\/$/, '');
const uriOf = (path: string) => `${jupyterRoot}/${path.split('/').map(encodeURIComponent).join('/')}`;
const pathOf = (uri: string) => (uri.startsWith(jupyterRoot + '/') ? decodeURIComponent(uri.slice(jupyterRoot.length + 1)) : null);

const isMarkdown = (w: Editor | null): w is Editor => !!w && w.context.path.endsWith('.md');
const cm = (w: Editor) => w.content.editor as CodeMirrorEditor;

/** The (1-based) line at the top of the editor's viewport. */
function topLine(w: Editor) {
  const view = cm(w).editor;
  return view.state.doc.lineAt(view.lineBlockAtHeight(view.scrollDOM.scrollTop).from).number;
}

/** Open `path` in Lab and put the cursor on (0-based) `line`. */
async function show(docs: IDocumentManager, path: string, line: number) {
  const w = docs.openOrReveal(path) as Editor | undefined;
  await w?.context.ready;
  w?.content.editor.setCursorPosition({ line, column: 0 });
  w?.content.editor.revealPosition({ line, column: 0 });
  w?.content.editor.focus();
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: '@myst-author/jupyterlab:plugin',
  description: 'MyST reference intelligence and live preview.',
  autoStart: true,
  requires: [IEditorTracker, IDocumentManager],
  optional: [ICommandPalette],
  activate: (app: JupyterFrontEnd, tracker: IEditorTracker, docs: IDocumentManager, palette: ICommandPalette | null) => {
    // Without rootUri, document URIs would be wrong, so skip the language features. The preview still works.
    const lsp = jupyterRoot ? connectLsp(server) : Promise.reject(new Error("jupyter-lsp didn't set rootUri"));
    lsp.then((l) => {
      // Go to definition in another file: open it in Lab, then hand lsp-client its editor.
      l.client.workspace.displayFile = async (uri) => {
        const w = pathOf(uri) ? (docs.openOrReveal(pathOf(uri)!) as Editor | undefined) : undefined;
        await w?.context.ready;
        return w ? cm(w).editor : null;
      };
      const attach = (w: Editor) => isMarkdown(w) && cm(w).injectExtension(l.client.plugin(uriOf(w.context.path), 'markdown'));
      tracker.forEach(attach);
      tracker.widgetAdded.connect((_, w) => attach(w));
    }, (err) => console.warn(`MyST Author: no language features from ${server} (${err})`));

    let preview: MainAreaWidget<MystPreview> | undefined;
    const command = 'myst-author:open-preview';
    app.commands.addCommand(command, {
      label: 'MyST: Open Preview to the Side',
      execute: () => {
        if (preview && !preview.isDisposed) return app.shell.activateById(preview.id);
        preview = new MainAreaWidget({ content: new MystPreview(tracker, docs, lsp) });
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
  private project: Promise<string>; // the project folder, relative to Jupyter's root
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
      const symbols = await l.client.request<unknown, { name: string; location: { uri: string; range: { start: { line: number } } } }[] | null>('workspace/symbol', { query: id });
      const s = symbols?.find((s) => s.name === id.toLowerCase());
      const path = s && pathOf(s.location.uri);
      return path != null ? { path: PathExt.relative(await this.project, path), line: s!.location.range.start.line } : undefined;
    },
    warn: (message) => console.warn(`MyST Author: ${message}`),
  }, Promise.resolve(contentServer(server + 'myst')));

  constructor(private tracker: IEditorTracker, private docs: IDocumentManager, private lsp: Promise<Lsp>) {
    super();
    this.title.label = 'MyST Preview';
    this.title.closable = true;
    this.project = lsp.then((l) => pathOf(l.root) ?? '', () => '');
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
