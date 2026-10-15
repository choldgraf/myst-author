import { resolve } from 'node:path';
import * as vscode from 'vscode';
import { PreviewController } from '@myst-author/preview/controller';
import { isMarkdown, linkHost, projectPath, webviewHtml, type Project } from './project.ts';

/** A webview beside the editor that previews the active markdown file, like the web app's preview pane. */
export class MystPreview {
  private panel?: vscode.WebviewPanel;
  private editor = isMarkdown(vscode.window.activeTextEditor?.document) ? vscode.window.activeTextEditor : undefined;
  private preview: PreviewController;

  constructor(
    private context: vscode.ExtensionContext,
    private project: Project,
  ) {
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
    context.subscriptions.push(
      this.preview,
      vscode.window.onDidChangeActiveTextEditor((e) => {
        // Focusing the preview itself leaves no active editor; keep following the last markdown one.
        if (!isMarkdown(e?.document) || e === this.editor) return;
        this.editor = e;
        this.retitle();
        this.preview.sendFile();
      }),
      vscode.workspace.onDidChangeTextDocument((e) => e.document === this.editor?.document && this.preview.sendText()),
      vscode.workspace.onDidSaveTextDocument((d) => d === this.editor?.document && this.preview.sendText()),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (e.textEditor === this.editor && e.visibleRanges[0]) this.preview.scroll(e.visibleRanges[0].start.line + 1);
      }),
    );
  }

  open() {
    if (this.panel) return this.panel.reveal(vscode.ViewColumn.Beside, true);
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    const panel = vscode.window.createWebviewPanel(
      'mystAuthor.preview',
      'MyST Preview',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [dist] },
    );
    const { webview } = panel;
    webview.html = webviewHtml(webview, dist, 'preview', this.project.assets);
    webview.onDidReceiveMessage((m) => this.preview.onMessage(m));
    panel.onDidDispose(() => (this.panel = undefined));
    this.panel = panel;
    this.retitle();
  }

  private show(uri: vscode.Uri, line: number) {
    const pos = new vscode.Position(line, 0);
    return vscode.window.showTextDocument(uri, { viewColumn: this.editor?.viewColumn, selection: new vscode.Range(pos, pos) });
  }

  private retitle() {
    if (this.panel && this.editor) this.panel.title = `MyST: ${this.editor.document.uri.path.split('/').pop()}`;
  }
}
