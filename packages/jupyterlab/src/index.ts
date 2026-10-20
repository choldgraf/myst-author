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
import { connectLsp, fileUri, type Lsp } from '@myst-author/lsp-client/client';
import { contentServer, type ContentServer } from 'mystmd-client/content-server';
import { Preview } from '@myst-author/preview';
import { findLabel, followLink, isExternal, PreviewController, type ToPage } from '@myst-author/preview/controller';
import { followLinks, livePreview, offerBuilt, shadowSheet, showBuilt, topLine, type FollowLink } from '@myst-author/preview/live';
import { mountPreviewPage } from '@myst-author/preview/page';
import { cellPages, fromBuiltPage, parseMyst, type ParseResult } from '@myst-author/preview/parse';
// React isn't a dependency of this package. It comes with @myst-author/preview, which renders with it.
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MystToc } from './toc.ts';
import liveCss from '../dist/live.css'; // the preview's CSS, for the extension's shadow roots (see build.mjs)

export type Editor = IDocumentWidget<FileEditor>;

// The language server's websocket. jupyter-lsp, which comes with JupyterLab, runs the server (see binder/jupyter_server_config.py).
// jupyter-lsp shares that one server with every browser tab and sends each answer to all of them, so a second Lab tab sees this tab's responses.
const lspServer = URLExt.join(PageConfig.getBaseUrl(), 'lsp/ws/mystmd-lsp');
// Jupyter's root folder as a file:// URI (set by jupyter-lsp), to map Lab paths to document URIs.
// It is the language server's workspace: a document's project is the nearest myst.yml between it and this folder.
const jupyterRoot = PageConfig.getOption('rootUri').replace(/\/$/, '');

/** A MyST project the language server found: its folder as a Lab path, and a client for the mystmd it runs there. */
export type Project = { root: string; content: ContentServer };
/** The project a document is a page of, or undefined when it isn't one (see `projectFor` in the plugin). */
export type ProjectFor = (path: string) => Promise<Project | undefined>;
// Live preview in Markdown editors and notebook Markdown cells. Blocks render in shadow roots, so the preview's CSS can't restyle Lab.
// Blocks use Lab's content font size, like its rendered Markdown, rather than the preview's 16px.
const cellCss = `${liveCss}\n.article { font-size: var(--jp-content-font-size1); line-height: var(--jp-content-line-height) }`;
const live = livePreview({ css: cellCss });
const liveMode = new Compartment();
let liveOn = true;
// The preview panel also renders in a shadow root.
// The inner div is the page's body, and scrolls. It has no top padding, so the badge bar sticks to its very top.
const previewCss = shadowSheet(`${liveCss}
:host > div { position: relative; box-sizing: border-box; height: 100%; overflow: auto; padding: 0 2rem 1rem; background: white; color: black }`);

// Rendered Markdown cells show mystmd's build, so references to other pages resolve.
// It renders in a shadow root on the cell's rendered widget, which is Lab's or jupyterlab-myst's.
// A cell whose text differs from the build shows the fast parse, as the live preview does, until mystmd rebuilds.
// An empty cell's shadow root holds just a <slot>, which shows that widget's own rendering (Lab's hint text) underneath.
// Trim the cell's outer margins, as Lab does for rendered Markdown.
const cellSheet = shadowSheet(`${cellCss}\n.article > :first-child > :first-child { margin-top: 0 } .article > :last-child > :last-child { margin-bottom: 0 }`);
const cellRoots = new WeakMap<HTMLElement, Root>();
// Each Markdown cell's build and the cell text it was built from. The cell shows the build only while its text still matches.
const cellBuilds = new WeakMap<Cell, { result: ParseResult; source: string }>();
const openExternal = (url: string) => void window.open(url, '_blank', 'noopener');
function showCell(cell: Cell, onFollowLink: FollowLink) {
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

/**
 * The `followLink` callbacks shared by the preview and live blocks, like the VS Code extension's `linkHost`.
 * Files open in Lab, and labels are found through the language server.
 */
const linkHost = (docs: IDocumentManager, lsp: Promise<Lsp>, { root }: Project) => ({
  open: (path: string, line: number) => show(docs, PathExt.join(root, path), line),
  openExternal,
  findLabel: async (id: string) => {
    const l = await lsp;
    // A label in a notebook cell has `#<cell id>`.
    const pathOf = (uri: string) => { const p = l.path(uri.split('#')[0]); const rel = p == null ? '..' : PathExt.relative(root, p); return rel.startsWith('..') ? null : rel; };
    return findLabel((method, params) => l.client.request(method, params), id, pathOf);
  },
  warn: (message: string) => console.warn(`MyST Author: ${message}`),
});

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
    const lsp = jupyterRoot ? Promise.resolve(connectLsp(lspServer, jupyterRoot)) : Promise.reject(new Error("jupyter-lsp didn't set rootUri"));
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
    }, (err) => console.warn(`MyST Author: no language features from ${lspServer} (${err})`));

    // The project a document is a page of, from the language server.
    // The server runs mystmd for each project it finds, as in the VS Code extension.
    // Undefined for a file outside every project, one mystmd doesn't build, or a server that isn't answering.
    // That leaves the built preview off, but the fast preview still works.
    const projects = new Map<string, Project>();
    const projectFor: ProjectFor = async (path) => {
      const l = await lsp.catch(() => undefined);
      const found = await l?.client.request<{ uri: string }, { root?: string; contentServer?: string; page?: boolean }>('myst/project', { uri: l.uri(path) }).catch(() => undefined);
      if (!found?.root || !found.contentServer || !found.page) return;
      const { root, contentServer: url } = found;
      let project = projects.get(root);
      if (!project) {
        const labRoot = l!.path(fileUri(root));
        if (labRoot == null) return; // outside Jupyter's root, so Lab can't open its files
        // mystmd listens on the Jupyter server, so the browser reaches it through jupyter-server-proxy's /proxy/<port>/.
        const p: Project = { root: labRoot, content: contentServer(URLExt.join(PageConfig.getBaseUrl(), 'proxy', new URL(url).port)) };
        p.content.watch(() => rebuilt(p));
        projects.set(root, (project = p));
      }
      return project;
    };
    /** The built page for a document, from its project's mystmd. Undefined without a project or a build. */
    const builtPage = async (path: string) => {
      const p = await projectFor(path);
      return p && (await p.content.built(PathExt.relative(p.root, path))).page;
    };
    // A rebuild refreshes every open document, not just the project's.
    // Each one asks for its project again, which is cheap.
    const rebuilt = (project: Project) => {
      tracker.forEach((w) => isMarkdown(w) && sendBuilt(w));
      notebooks.forEach(sendBuiltCells);
      toc.rebuilt(project);
    };

    const toc = new MystToc(docs, projectFor);
    tracker.currentChanged.connect((_, w) => isMarkdown(w) && toc.follow(w));
    if (isMarkdown(tracker.currentWidget)) toc.follow(tracker.currentWidget);

    /** A click on a rendered link in the file or notebook at `path`, as in the preview pane. Without a project, only external links go anywhere. */
    const follow = async (path: string, href: string, line?: number) => {
      const p = await projectFor(path);
      if (p) followLink({ ...linkHost(docs, lsp, p), fileForSlug: (slug) => p.content.fileForSlug(slug) }, PathExt.relative(p.root, path), href, line);
      else if (isExternal(href)) openExternal(href);
    };
    const linksIn = (path: string): FollowLink => (href, line) => follow(path, href, line);

    // Add live preview and link following to an editor, and the language client once it connects.
    // `path` is the file or notebook in Lab, and `uri` gives the editor's document URI.
    const attachEditor = (editor: CodeMirrorEditor, path: string, uri: (l: Lsp) => string) => {
      editor.injectExtension(liveMode.of(liveOn ? live : []));
      editor.injectExtension(followLinks(linksIn(path)));
      lsp.then((l) => editor.injectExtension(l.client.plugin(uri(l), 'markdown')), () => {});
    };

    // Live blocks render mystmd's build when it matches the text, which resolves embeds and references to other pages.
    const sendBuilt = async (w: Editor) => {
      const page = await builtPage(w.context.path);
      if (page) offerBuilt(cm(w).editor, page);
    };

    const attach = async (w: Editor) => {
      if (!isMarkdown(w)) return;
      attachEditor(cm(w), w.context.path, (l) => l.uri(w.context.path));
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
        attachEditor(cell.editor as CodeMirrorEditor, nb.context.path, (l) => `${l.uri(nb.context.path)}#${cell.model.id}`);
        // Lab adds the cell's rendered widget each time the cell renders, such as when you stop editing it, so check again then whether the build matches.
        new MutationObserver(() => showCell(cell, linksIn(nb.context.path))).observe(cell.inputArea!.node, { childList: true });
        return true;
      })).then((added) => { if (added.includes(true)) sendBuiltCells(nb); });

    // Cells use their block of the build while their text is as saved (see `cellPages`).
    // The notebook being clean isn't the test: starting a kernel changes its metadata, which marks it dirty.
    // Just after a save, a cell's saved text can be ahead of the build, and the cell shows its old block until mystmd rebuilds.
    const savedSources = new WeakMap<NotebookPanel, string[]>();
    const sendBuiltCells = async (nb: NotebookPanel) => {
      const page = await builtPage(nb.context.path);
      const sources = nb.content.widgets.map((cell) => cell.model.sharedModel.getSource());
      const pages = page ? cellPages(page, sources, savedSources.get(nb) ?? []) : [];
      nb.content.widgets.forEach((cell, i) => {
        const source = sources[i];
        const built = pages[i];
        if (cell.model.type === 'markdown') {
          const result = built && fromBuiltPage(built);
          if (result) cellBuilds.set(cell, { result, source });
          else cellBuilds.delete(cell);
          showCell(cell, linksIn(nb.context.path));
        }
        if (!built || !attached.has(cell) || !cell.editor) return;
        (cell.editor as CodeMirrorEditor).editor.dispatch({ effects: showBuilt.of({ page: built, text: source }) });
      });
    };
    const watch = (nb: NotebookPanel) =>
      nb.context.ready.then(() => {
        // Record each cell's text as last loaded or saved, by position, so added or moved cells show Lab's rendering until you save and mystmd rebuilds.
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
        preview = new MainAreaWidget({ content: new MystPreview(tracker, docs, lsp, projectFor) });
        preview.id = 'myst-author-preview';
        app.shell.add(preview, 'main', { mode: 'split-right', ref: tracker.currentWidget?.id });
      },
    });
    palette?.addItem({ command, category: 'MyST' });
    app.contextMenu.addItem({ command, selector: '.jp-FileEditor', rank: 0 });

    app.shell.add(toc, 'left', { rank: 300 });
  },
};

/** The preview page from `@myst-author/preview/page`, as in VS Code, in a shadow root. It follows the current Markdown editor and its project. */
class MystPreview extends Widget {
  private editor: Editor | null = null;
  private project?: Project;
  private preview?: PreviewController; // one per project: each has its own content server
  private following?: Editor; // the editor whose project is being looked up, so a slow answer can't overtake a newer one
  private receive: (m: ToPage) => void = () => {};
  private root: ReturnType<typeof mountPreviewPage>;

  constructor(tracker: IEditorTracker, private docs: IDocumentManager, private lsp: Promise<Lsp>, private projectFor: ProjectFor) {
    super();
    this.title.label = 'MyST Preview';
    this.title.closable = true;
    const shadow = this.node.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [previewCss];
    this.root = mountPreviewPage(shadow.appendChild(document.createElement('div')), {
      postMessage: (m) => this.preview?.onMessage(m),
      listen: (receive) => (this.receive = receive),
    });
    tracker.currentChanged.connect((_, w) => this.follow(w), this);
    this.follow(tracker.currentWidget);
  }

  dispose() {
    this.root.unmount();
    this.unfollow();
    this.following = undefined; // a lookup still pending must not revive the panel
    this.preview?.dispose();
    Signal.clearData(this);
    super.dispose();
  }

  // Focusing the preview leaves the tracker's current widget alone, so this only follows other Markdown editors.
  // A file with no project leaves the preview on the last one.
  private async follow(w: Editor | null) {
    if (!isMarkdown(w)) return;
    this.following = w; // also drops a pending lookup when the user returns to the editor already followed
    if (w === this.editor) return;
    const project = await this.projectFor(w.context.path);
    if (!project || this.following !== w) return;
    this.unfollow();
    if (project !== this.project) {
      this.preview?.dispose();
      this.project = project;
      this.preview = this.controller(project);
    }
    const preview = this.preview!;
    this.editor = w;
    this.title.label = `MyST: ${PathExt.basename(w.context.path)}`;
    w.content.model.sharedModel.changed.connect(this.onText);
    w.context.model.stateChanged.connect(this.onText); // the dirty flag
    cm(w).editor.scrollDOM.addEventListener('scroll', this.onScroll);
    preview.sendFile();
  }

  private unfollow() {
    const w = this.editor;
    if (!w) return;
    w.content.model.sharedModel.changed.disconnect(this.onText);
    w.context.model.stateChanged.disconnect(this.onText);
    cm(w).editor.scrollDOM.removeEventListener('scroll', this.onScroll);
    this.editor = null;
  }

  private controller(project: Project) {
    const { root, content } = project;
    return new PreviewController({
      ...linkHost(this.docs, this.lsp, project),
      current: () => {
        const w = this.editor;
        return w ? { path: PathExt.relative(root, w.context.path), text: w.content.model.sharedModel.getSource(), dirty: w.context.model.dirty, line: topLine(cm(w).editor) } : undefined;
      },
      post: (m) => this.receive(m),
    }, content);
  }

  // Lab emits these inside CodeMirror's update, where `current` can't read the editor's layout, so defer.
  private onText = () => void setTimeout(() => this.preview?.sendText());
  private onScroll = () => this.editor && this.preview?.scroll(topLine(cm(this.editor).editor));
}

export default plugin;
