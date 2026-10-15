import { resolve } from 'node:path';
import * as vscode from 'vscode';
import { PreviewController } from '@myst-author/preview/controller';
import { isMarkdown, linkHost, projectPath, webviewHtml, type Project, type ProjectFor } from './project.ts';

/** A webview beside the editor that previews the active markdown file, like the web app's preview pane. */
export class MystPreview {
  private panel?: vscode.WebviewPanel;
  private editor?: vscode.TextEditor; // the last Markdown editor that is a page of a project
  private project?: Project;
  private preview?: PreviewController; // one per project: each has its own content server
  private following?: vscode.TextEditor; // whose project is being looked up, so a slow answer can't overtake a newer one

  constructor(
    private context: vscode.ExtensionContext,
    private projectFor: ProjectFor,
  ) {
    context.subscriptions.push(
      new vscode.Disposable(() => this.preview?.dispose()),
      vscode.window.onDidChangeActiveTextEditor((e) => {
        // Focusing the preview itself leaves no active editor, so keep following the last Markdown one.
        if (e && isMarkdown(e.document) && e !== this.editor) this.follow(e);
      }),
      vscode.workspace.onDidChangeTextDocument((e) => e.document === this.editor?.document && this.preview?.sendText()),
      vscode.workspace.onDidSaveTextDocument((d) => d === this.editor?.document && this.preview?.sendText()),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (e.textEditor === this.editor && e.visibleRanges[0]) this.preview?.scroll(e.visibleRanges[0].start.line + 1);
      }),
    );
    const active = vscode.window.activeTextEditor;
    if (active && isMarkdown(active.document)) this.follow(active);
  }

  /** Open beside the editor, showing the active Markdown file if it's a page, else the last one followed. */
  async open() {
    const active = vscode.window.activeTextEditor;
    if (active && isMarkdown(active.document)) await this.follow(active);
    if (!this.editor) return void vscode.window.showInformationMessage("This file isn't a page of a MyST project (a folder with myst.yml).");
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

  /** Follow `editor` if its file is a page of a project. A file that isn't leaves the preview on the last one. */
  private async follow(editor: vscode.TextEditor) {
    this.following = editor;
    const project = await this.projectFor(editor.document.uri);
    if (!project || this.following !== editor) return;
    this.editor = editor;
    this.retitle();
    if (project === this.project) return this.preview?.sendFile();
    this.preview?.dispose();
    this.project = project;
    this.preview = new PreviewController({
      ...linkHost(project),
      current: () => {
        const doc = this.panel && this.editor?.document;
        const top = this.editor?.visibleRanges[0];
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

  private show(uri: vscode.Uri, line: number) {
    const pos = new vscode.Position(line, 0);
    return vscode.window.showTextDocument(uri, { viewColumn: this.editor?.viewColumn, selection: new vscode.Range(pos, pos) });
  }

  private retitle() {
    if (this.panel && this.editor) this.panel.title = `MyST: ${this.editor.document.uri.path.split('/').pop()}`;
  }
}
