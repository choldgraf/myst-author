import { randomBytes } from 'node:crypto';
import { relative, sep } from 'node:path';
import * as vscode from 'vscode';
import type { ContentServer } from '@myst-author/mystmd/built';
import { findLabel, type Request } from '@myst-author/preview/controller';
import type { Myst } from '@myst-author/mystmd/start';

/** The language server script: `mystAuthor.serverPath`, or the copy of mystmd-lsp's bundle in dist/. */
export const serverScript = (context: vscode.ExtensionContext) =>
  vscode.workspace.getConfiguration('mystAuthor').get<string>('serverPath') || context.asAbsolutePath('dist/lsp.js');

/**
 * The MyST project the extension started: its folder, its mystmd, and requests to its language server.
 * `assets` is mystmd's URL as webviews reach it, and `content` its content server once mystmd is up.
 */
export type Project = { root: string; myst: Myst; request: Request; assets: Thenable<string>; content: Promise<ContentServer> };

/** Project-relative path with `/` separators, matching the content server's page `location`. */
export const projectPath = (root: string, uri: vscode.Uri) => relative(root, uri.fsPath).split(sep).join('/');

/** mystmd's `url` as webviews reach it: in Codespaces and code-server they run in the browser, so images need the forwarded URL. */
export const webviewUrl = (url: string) => vscode.env.asExternalUri(vscode.Uri.parse(url)).then((u) => u.toString().replace(/\/$/, ''));

// Markdown files, not notebook cells (which are Markdown documents too).
export const isMarkdown = (d?: vscode.TextDocument) => d?.languageId === 'markdown' && d.uri.scheme === 'file';

/** What the preview and the live editor both give `followLink`: external links, labels through the language server, and warnings. */
export const linkHost = ({ root, request }: Project) => ({
  openExternal: (url: string) => vscode.env.openExternal(vscode.Uri.parse(url)),
  findLabel: async (id: string) => {
    const s = await findLabel(request, id);
    return s && { path: projectPath(root, vscode.Uri.parse(s.uri)), line: s.line };
  },
  warn: (message: string) => vscode.window.showWarningMessage(message),
});

/**
 * A webview page that runs `dist/<script>.js` with the preview's CSS.
 * Built pages load images and cross-reference hover data from `assets` (the content server as the webview reaches it), plus any remote images the author links to.
 */
export function webviewHtml(webview: vscode.Webview, dist: vscode.Uri, script: string, assets?: string) {
  const src = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(dist, file));
  const nonce = randomBytes(16).toString('base64');
  const origin = assets ? new URL(assets).origin : '';
  const csp = `default-src 'none'; img-src ${webview.cspSource} ${origin} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; connect-src ${origin}; script-src 'nonce-${nonce}';`;
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${src('webview.css')}">
</head><body>
<div id="root"></div>
<script nonce="${nonce}" src="${src(`${script}.js`)}"></script>
</body></html>`;
}
