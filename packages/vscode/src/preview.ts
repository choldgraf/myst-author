import { randomBytes } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import * as vscode from 'vscode';
import { builtPages, watchBuilds } from '@myst-author/preview/built';

const isMarkdown = (e?: vscode.TextEditor): e is vscode.TextEditor => e?.document.languageId === 'markdown';

/** A webview beside the editor that previews the active markdown file, like the web app's preview pane. */
export class MystPreview {
  private panel?: vscode.WebviewPanel;
  private editor = isMarkdown(vscode.window.activeTextEditor) ? vscode.window.activeTextEditor : undefined;
  private pages?: ReturnType<typeof builtPages> | null; // undefined while mystmd starts, null if unavailable

  constructor(
    private context: vscode.ExtensionContext,
    private root: string | undefined,
    port: Promise<number | undefined>,
  ) {
    port.then((p) => {
      this.pages = p ? builtPages(`http://localhost:${p}`) : null;
      if (p) context.subscriptions.push({ dispose: watchBuilds(`ws://localhost:${p}/socket`, () => this.sendBuilt()) });
      this.sendBuilt();
    });
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        // Focusing the preview itself leaves no active editor; keep following the last markdown one.
        if (!isMarkdown(e) || e === this.editor) return;
        this.editor = e;
        this.sendText();
        this.sendBuilt();
      }),
      vscode.workspace.onDidChangeTextDocument((e) => e.document === this.editor?.document && this.sendText()),
      vscode.workspace.onDidSaveTextDocument((d) => d === this.editor?.document && this.sendText()),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (e.textEditor === this.editor && e.visibleRanges[0]) this.post({ type: 'scroll', line: e.visibleRanges[0].start.line + 1 });
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
    const src = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, file));
    const nonce = randomBytes(16).toString('base64');
    // Built pages load images straight from the content server on localhost.
    const csp = `default-src 'none'; img-src ${webview.cspSource} http://localhost:* https: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
    webview.html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${src('webview.css')}">
</head><body>
<div id="root"></div>
<script nonce="${nonce}" src="${src('webview.js')}"></script>
</body></html>`;
    webview.onDidReceiveMessage((m) => this.onMessage(m));
    panel.onDidDispose(() => (this.panel = undefined));
    this.panel = panel;
  }

  private onMessage(m: { type: string; line?: number; href?: string }) {
    const editor = this.editor;
    if (m.type === 'ready') {
      this.sendText();
      this.sendBuilt();
      if (editor?.visibleRanges[0]) this.post({ type: 'scroll', line: editor.visibleRanges[0].start.line + 1 });
    } else if (m.type === 'reveal' && editor) {
      this.show(editor.document.uri, m.line! - 1);
    } else if (m.type === 'follow') {
      this.follow(m.href!, m.line);
    }
  }

  /** Cmd/Ctrl-click on a link in the preview; `line` is where an in-page `#id` target renders, if found. */
  private async follow(href: string, line?: number) {
    if (/^[a-z][\w+.-]*:/i.test(href)) return vscode.env.openExternal(vscode.Uri.parse(href)); // http:, mailto:, …
    const doc = this.editor?.document;
    if (!doc) return;
    const [path, id] = href.split('#');
    // Built pages link to other pages by slug (`/slug`); the fast preview keeps the author's relative path.
    const location = [...(this.pages?.slugs ?? [])].find(([, slug]) => '/' + slug === path)?.[0];
    const uri = !path ? doc.uri
      : location && this.root ? vscode.Uri.file(join(this.root, location))
      : path.startsWith('/') ? undefined
      : vscode.Uri.joinPath(doc.uri, '..', decodeURIComponent(path));
    if (id) {
      // Labels are project-wide, so ask the LSP where it is.
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', id);
      const s = symbols?.find((s) => s.name === id.toLowerCase());
      if (s) return this.show(s.location.uri, s.location.range.start.line);
      if (line && uri?.toString() === doc.uri.toString()) return this.show(doc.uri, line - 1);
    }
    if (uri) this.show(uri, 0);
    else vscode.window.showWarningMessage(`Can't follow ${href}`);
  }

  private show(uri: vscode.Uri, line: number) {
    const pos = new vscode.Position(line, 0);
    return vscode.window.showTextDocument(uri, { viewColumn: this.editor?.viewColumn, selection: new vscode.Range(pos, pos) });
  }

  private post(message: object) {
    this.panel?.webview.postMessage(message);
  }

  /** Project-relative path with `/` separators, matching the content server's page `location`. */
  private path(doc: vscode.TextDocument) {
    const rel = this.root ? relative(this.root, doc.uri.fsPath) : '..';
    return rel.startsWith('..') ? doc.uri.fsPath : rel.split(sep).join('/');
  }

  private sendText() {
    const doc = this.editor?.document;
    if (!doc || !this.panel) return;
    this.panel.title = `MyST: ${doc.uri.path.split('/').pop()}`;
    this.post({ type: 'text', path: this.path(doc), text: doc.getText(), dirty: doc.isDirty });
  }

  private async sendBuilt() {
    const doc = this.editor?.document;
    if (!doc || !this.panel || this.pages === undefined) return;
    const path = this.path(doc);
    if (this.pages === null) return this.post({ type: 'built', path, page: null, error: 'mystmd not found' });
    try {
      this.post({ type: 'built', path, page: await this.pages.page(path) });
    } catch (err) {
      this.post({ type: 'built', path, page: null, error: (err as Error).message });
    }
  }
}
