import { resolve } from 'node:path';
import * as vscode from 'vscode';
import { PreviewController } from '@myst-author/preview/controller';
import type { LiveEditor } from './live.ts';
import { isMarkdown, linkHost, projectPath, webviewHtml, type Project, type ProjectFor } from './project.ts';

/** A webview beside the editor that previews the active markdown file, like the web editor's preview pane. */
export class MystPreview {
  private panel?: vscode.WebviewPanel;
  private document?: vscode.TextDocument; // the last Markdown file, in a text or live editor, that is a page of a project
  private project?: Project;
  private preview?: PreviewController; // one per project: each has its own content server
  private following?: vscode.TextDocument; // whose project is being looked up, so a slow answer can't overtake a newer one

  constructor(
    private context: vscode.ExtensionContext,
    private projectFor: ProjectFor,
    private live: LiveEditor,
  ) {
    context.subscriptions.push(
      new vscode.Disposable(() => this.preview?.dispose()),
      vscode.window.onDidChangeActiveTextEditor((e) => {
        // Focusing the preview itself leaves no active editor, so keep following the last Markdown one.
        if (e && isMarkdown(e.document) && e.document !== this.document) this.follow(e.document);
      }),
      live.onDidChangeActiveDocument((d) => d !== this.document && this.follow(d)),
      vscode.workspace.onDidChangeTextDocument((e) => e.document === this.document && this.preview?.sendText()),
      vscode.workspace.onDidSaveTextDocument((d) => d === this.document && this.preview?.sendText()),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (e.textEditor.document === this.document && e.visibleRanges[0]) this.preview?.scroll(e.visibleRanges[0].start.line + 1);
      }),
    );
    const active = vscode.window.activeTextEditor;
    if (active && isMarkdown(active.document)) this.follow(active.document);
  }

  /** Open beside the editor, showing the active Markdown file if it's a page, else the last one followed. */
  async open() {
    const active = vscode.window.activeTextEditor;
    if (active && isMarkdown(active.document)) await this.follow(active.document);
    if (!this.document) return void vscode.window.showInformationMessage("This file isn't a page of a MyST project (a folder with myst.yml).");
    if (this.panel) return this.panel.reveal(vscode.ViewColumn.Beside, true);
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    const panel = vscode.window.createWebviewPanel(
      'mystAuthor.preview',
      'MyST Preview',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [dist] },
    );
    const { webview } = panel;
    webview.html = this.html(webview);
    webview.onDidReceiveMessage((m) => this.preview?.onMessage(m));
    panel.onDidDispose(() => (this.panel = undefined));
    this.panel = panel;
    this.retitle();
  }

  /** Follow `document` if it is a page of a project. A file that isn't leaves the preview on the last one. */
  private async follow(document: vscode.TextDocument) {
    this.following = document;
    const project = await this.projectFor(document.uri);
    if (!project || this.following !== document) return;
    this.document = document;
    this.retitle();
    if (project === this.project) return this.preview?.sendFile();
    this.preview?.dispose();
    this.project = project;
    this.preview = new PreviewController({
      ...linkHost(project),
      current: () => {
        const doc = this.panel && this.document;
        const top = this.textEditor()?.visibleRanges[0]; // a live editor has no visible range, so its preview starts at the top
        return doc && { path: projectPath(project.root, doc.uri), text: doc.getText(), dirty: doc.isDirty, line: top && top.start.line + 1 };
      },
      post: (m) => this.panel?.webview.postMessage(m),
      open: (path, line) => this.show(vscode.Uri.file(resolve(project.root, path)), line),
    }, Promise.resolve(project.content));
    // The page is built for one project's assets, so reload it. It asks for the file once ready.
    if (this.panel) this.panel.webview.html = this.html(this.panel.webview);
  }

  private html(webview: vscode.Webview) {
    return webviewHtml(webview, vscode.Uri.joinPath(this.context.extensionUri, 'dist'), 'preview', this.project?.assets);
  }

  /** The text editor showing the followed document, if it's in one rather than a live editor. */
  private textEditor() {
    return vscode.window.visibleTextEditors.find((e) => e.document === this.document);
  }

  private show(uri: vscode.Uri, line: number) {
    return this.live.open(uri, line, this.textEditor()?.viewColumn);
  }

  private retitle() {
    if (this.panel && this.document) this.panel.title = `MyST: ${this.document.uri.path.split('/').pop()}`;
  }
}
