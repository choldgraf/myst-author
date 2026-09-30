import { relative, sep } from 'node:path';
import * as vscode from 'vscode';
import { lspArgs } from '@myst-author/lsp/args';
import { spawnLsp } from '@myst-author/lsp/spawn';
import { contentServer, sha256, type BuiltPage } from '@myst-author/mystmd/built';
import type { startMyst } from '@myst-author/mystmd/start';
import { webviewHtml } from './preview.ts';

/** The MyST project the extension started: its folder and its mystmd. */
export type Project = { root: string; myst: Awaited<ReturnType<typeof startMyst>> };

/** A position as VS Code and LSP count it (0-based). Not an offset: CodeMirror counts a CRLF as one character, VS Code as two. */
export type Pos = { line: number; character: number };
export type Change = { from: Pos; to: Pos; insert: string };

/** Messages from the extension to the live editor webview (`live-webview.tsx`). */
export type ToLive =
  | { type: 'init'; text: string }
  | { type: 'changes'; changes: Change[] } // edits made outside the webview, to apply one after another
  | { type: 'connect'; root: string; uri: string } // start the language client: the project folder's URI, and this file's
  | { type: 'lsp'; message: string }
  | { type: 'built'; page: BuiltPage; text: string }; // mystmd's build of `text` (with \n line breaks)

/** Messages from the webview. */
export type FromLive =
  | { type: 'ready' }
  | { type: 'edit'; changes: Change[] } // one CodeMirror transaction: positions in the text before it, as in a WorkspaceEdit
  | { type: 'lsp'; message: string };

const toPos = (p: vscode.Position): Pos => ({ line: p.line, character: p.character });

/**
 * Edits Markdown files in a webview with the same CodeMirror live preview as the web app and JupyterLab.
 * VS Code doesn't let extensions render HTML inside its text editor, so this is a custom editor on the same TextDocument:
 * saving, the dirty flag, and a text editor open on the same file all stay VS Code's.
 */
export class LiveEditor implements vscode.CustomTextEditorProvider {
  constructor(
    private context: vscode.ExtensionContext,
    private project: (uri: vscode.Uri) => Promise<Project> | undefined, // undefined outside a MyST project
  ) {}

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel) {
    const { webview } = panel;
    const post = (m: ToLive) => webview.postMessage(m);
    const at = (p: Pos) => new vscode.Position(p.line, p.character);
    const project = this.project(document.uri);
    // In Codespaces and code-server the webview runs in the browser, so images need the forwarded URL.
    const assets = await project
      ?.then(({ myst }) => vscode.env.asExternalUri(vscode.Uri.parse(myst.url)))
      .then((u) => u.toString().replace(/\/$/, ''));
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    webview.options = { enableScripts: true, localResourceRoots: [dist] };
    webview.html = webviewHtml(webview, dist, 'live', assets);

    // Edits from the webview, one at a time, so each one's positions match the document.
    // ponytail: an edit made elsewhere while one of these is in flight can put the two out of sync; send document versions if that bites.
    let queue = Promise.resolve();
    let applying = 0;
    const apply = (changes: Change[]) =>
      (queue = queue.then(async () => {
        const edit = new vscode.WorkspaceEdit();
        for (const c of changes) edit.replace(document.uri, new vscode.Range(at(c.from), at(c.to)), c.insert);
        applying++;
        await vscode.workspace.applyEdit(edit);
        applying--;
      }));

    let server: ReturnType<typeof spawnLsp> | undefined;
    let stopWatch: (() => void) | undefined;
    let disposed = false;
    const connect = ({ root, myst }: Project) => {
      if (disposed) return;
      // A server of its own, as each web app tab gets: lsp-client speaks raw LSP, which VS Code's language client can't pass on.
      server = spawnLsp(this.context.asAbsolutePath('dist/lsp.js'), lspArgs(myst.url, root), (message) => post({ type: 'lsp', message }));
      post({ type: 'connect', root: vscode.Uri.file(root).toString(), uri: document.uri.toString() });
      // Live blocks render mystmd's build when it matches the text, which resolves embeds and references to other pages.
      myst.ready.then(() => {
        if (disposed) return;
        const content = contentServer(myst.url, assets);
        const path = relative(root, document.uri.fsPath).split(sep).join('/');
        stopWatch = content.watch(async () => {
          const { page } = await content.built(path);
          const text = document.getText();
          if (page && page.sha256 === (await sha256(text))) post({ type: 'built', page, text: text.replaceAll('\r\n', '\n') });
        });
      }, () => {}); // no mystmd: blocks keep the fast render
    };

    const subscriptions = [
      webview.onDidReceiveMessage((m: FromLive) => {
        if (m.type === 'ready') {
          post({ type: 'init', text: document.getText() });
          project?.then(connect);
        } else if (m.type === 'edit') apply(m.changes);
        else if (m.type === 'lsp') server?.send(m.message);
      }),
      // Edits from anywhere else (the text editor, its undo, a rename, git) go to the webview.
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document !== document || applying || !e.contentChanges.length) return;
        post({ type: 'changes', changes: e.contentChanges.map((c) => ({ from: toPos(c.range.start), to: toPos(c.range.end), insert: c.text })) });
      }),
    ];
    panel.onDidDispose(() => {
      disposed = true;
      server?.child.kill();
      stopWatch?.();
      subscriptions.forEach((s) => s.dispose());
    });
  }
}
