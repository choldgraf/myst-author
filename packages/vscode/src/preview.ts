import { randomBytes } from 'node:crypto';
import { relative, resolve, sep } from 'node:path';
import * as vscode from 'vscode';
import { contentServer, mystmdMissing } from '@myst-author/preview/built';
import { PreviewController, type PreviewHost } from '@myst-author/preview/controller';
import type { startMyst } from '@myst-author/lsp/myst';

// Markdown files, not notebook cells (which are Markdown documents too).
const isMarkdown = (e?: vscode.TextEditor): e is vscode.TextEditor => e?.document.languageId === 'markdown' && e.document.uri.scheme === 'file';

/** A webview beside the editor that previews the active markdown file, like the web app's preview pane. */
export class MystPreview {
  private panel?: vscode.WebviewPanel;
  private editor = isMarkdown(vscode.window.activeTextEditor) ? vscode.window.activeTextEditor : undefined;
  private assets: Thenable<string | undefined>; // the content server's URL as the webview reaches it
  private preview: PreviewController;
  private host: PreviewHost = {
    current: () => {
      const doc = this.panel && this.editor?.document;
      const top = this.editor?.visibleRanges[0];
      return doc && { path: this.path(doc.uri), text: doc.getText(), dirty: doc.isDirty, line: top && top.start.line + 1 };
    },
    post: (m) => this.panel?.webview.postMessage(m),
    open: (path, line) => this.show(vscode.Uri.file(resolve(this.root ?? '/', path)), line),
    openExternal: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
    findLabel: async (id) => {
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', id);
      const s = symbols?.find((s) => s.name === id.toLowerCase());
      return s && { path: this.path(s.location.uri), line: s.location.range.start.line };
    },
    warn: (message) => vscode.window.showWarningMessage(message),
  };

  constructor(
    private context: vscode.ExtensionContext,
    private root: string | undefined,
    myst: Awaited<ReturnType<typeof startMyst>> | undefined,
  ) {
    // In Codespaces and code-server the webview runs in the browser, so images need the forwarded URL.
    this.assets = myst ? vscode.env.asExternalUri(vscode.Uri.parse(myst.url)).then((u) => u.toString().replace(/\/$/, '')) : Promise.resolve(undefined);
    // Without mystmd installed there's no built preview; the controller warns about any other failure.
    const server = myst
      ? myst.ready.then(async () => contentServer(myst.url, await this.assets), (err) => { if (err.message !== mystmdMissing) throw err; return null; })
      : Promise.resolve(null);
    this.preview = new PreviewController(this.host, server);
    context.subscriptions.push(
      this.preview,
      vscode.window.onDidChangeActiveTextEditor((e) => {
        // Focusing the preview itself leaves no active editor; keep following the last markdown one.
        if (!isMarkdown(e) || e === this.editor) return;
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

  async open() {
    const assets = await this.assets;
    if (this.panel) return this.panel.reveal(vscode.ViewColumn.Beside, true);
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    const panel = vscode.window.createWebviewPanel(
      'mystAuthor.preview',
      'MyST Preview',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [dist] },
    );
    const { webview } = panel;
    const src = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, file));
    const nonce = randomBytes(16).toString('base64');
    // Built pages load images from the content server, plus any remote images the author links to.
    const csp = `default-src 'none'; img-src ${webview.cspSource} ${assets ? new URL(assets).origin : ''} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
    webview.html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${src('webview.css')}">
</head><body>
<div id="root"></div>
<script nonce="${nonce}" src="${src('webview.js')}"></script>
</body></html>`;
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

  /** Project-relative path with `/` separators, matching the content server's page `location`. */
  private path(uri: vscode.Uri) {
    return relative(this.root ?? '/', uri.fsPath).split(sep).join('/');
  }
}
