import { resolve } from 'node:path';
import * as vscode from 'vscode';
import { spawnLsp } from '@myst-author/lsp-client/spawn';
import type { BuiltPage } from 'mystmd-client/content-server';
import { followLink } from '@myst-author/preview/controller';
import { linkHost, projectPath, webviewHtml, type Project, type ProjectFor } from './project.ts';

/** A position as VS Code and LSP count it (0-based). Not an offset: CodeMirror counts a CRLF as one character, VS Code as two. */
export type Pos = { line: number; character: number };
export type Change = { from: Pos; to: Pos; insert: string };

/** Messages from the extension to the live editor webview (`live-webview.tsx`). */
export type ToLive =
  | { type: 'init'; text: string }
  | { type: 'changes'; changes: Change[] } // edits made outside the webview, to apply one after another
  | { type: 'connect'; root: string; uri: string } // start the language client: the project folder's URI, and this file's
  | { type: 'lsp'; message: string }
  | { type: 'built'; page: BuiltPage } // mystmd's latest build of this file, which may not match the text
  | { type: 'select'; at: Pos };

/** Messages from the webview. */
export type FromLive =
  | { type: 'ready' }
  | { type: 'edit'; changes: Change[] } // one CodeMirror transaction: positions in the text before it, as in a WorkspaceEdit
  | { type: 'lsp'; message: string }
  | { type: 'definition' | 'references' | 'rename'; at: Pos } // cross-file actions, which VS Code handles
  | { type: 'follow'; href: string; line?: number }; // a click on a rendered link

const toPos = (p: vscode.Position): Pos => ({ line: p.line, character: p.character });

/**
 * Edits Markdown files in a webview with the same CodeMirror live preview as the web editor and JupyterLab.
 * VS Code doesn't let extensions render HTML inside its text editor, so this is a custom editor on the same TextDocument:
 * saving, the dirty flag, and a text editor open on the same file all stay VS Code's.
 */
export class LiveEditor implements vscode.CustomTextEditorProvider {
  private active = new vscode.EventEmitter<vscode.TextDocument>();
  /** The document of a live editor that just became active. A custom editor is never `activeTextEditor`, so the TOC and preview follow this too. */
  readonly onDidChangeActiveDocument = this.active.event;

  constructor(
    private context: vscode.ExtensionContext,
    private projectFor: ProjectFor,
  ) {
    context.subscriptions.push(this.active);
  }

  private ready = new Map<string, (m: ToLive) => void>(); // live editors whose webview is ready, by document URI
  private pending = new Map<string, Pos>(); // where `open` wants a live editor that is opening right now to go

  /** Open `uri` at `line` in its default editor, which the user may have made the live editor, as a text editor shows a selection. */
  async open(uri: vscode.Uri, line: number, viewColumn?: vscode.ViewColumn) {
    const key = uri.toString();
    const at = { line, character: 0 };
    this.pending.set(key, at); // a live editor opening now takes it in `resolveCustomTextEditor`
    await vscode.commands.executeCommand('vscode.open', uri, { viewColumn, selection: new vscode.Range(line, 0, line, 0) });
    this.pending.delete(key);
    this.ready.get(key)?.({ type: 'select', at }); // a live editor that was already open
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel) {
    const { webview } = panel;
    const key = document.uri.toString();
    const select = this.pending.get(key); // from `open`, for once the webview is ready
    const post = (m: ToLive) => webview.postMessage(m);
    const at = (p: Pos) => new vscode.Position(p.line, p.character);
    const project = await this.projectFor(document.uri);
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist');
    webview.options = { enableScripts: true, localResourceRoots: [dist] };
    webview.html = webviewHtml(webview, dist, 'live', project?.assets);

    // Edits from the webview, one at a time, so each one's positions match the document.
    // An edit made elsewhere while one of these is in flight can put the two out of sync. Send document versions if that bites.
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
    const connect = (p: Project) => {
      // A server of its own, as each web editor tab gets: lsp-client speaks raw LSP, which VS Code's language client can't pass on.
      server = spawnLsp(p.server, [`--content-server=${p.url}`, `--root=${p.root}`], (message) => post({ type: 'lsp', message }));
      post({ type: 'connect', root: vscode.Uri.file(p.root).toString(), uri: document.uri.toString() });
      // Live blocks render mystmd's build when it matches the text, which resolves embeds and references to other pages.
      const path = projectPath(p.root, document.uri);
      stopWatch = p.content.watch(async () => {
        const { page } = await p.content.built(path);
        if (page) post({ type: 'built', page });
      });
    };

    const subscriptions = [
      webview.onDidReceiveMessage((m: FromLive) => {
        if (m.type === 'ready') {
          post({ type: 'init', text: document.getText() });
          if (project) connect(project);
          this.ready.set(key, post);
          if (select) post({ type: 'select', at: select });
        } else if (m.type === 'edit') apply(m.changes);
        else if (m.type === 'lsp') server?.send(m.message);
        // lsp-client only acts on files open in an editor, which here is just this one.
        // VS Code's commands ask the extension's main language client (the same server code), and can edit or open any file.
        else if (m.type === 'definition') this.definition(document, at(m.at));
        else if (m.type === 'references') this.references(document, at(m.at), post);
        else if (m.type === 'rename') this.rename(document, at(m.at));
        else if (m.type === 'follow' && project) this.follow(document, project, m, post);
      }),
      // Edits from anywhere else (the text editor, its undo, a rename, git) go to the webview.
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document !== document || applying || !e.contentChanges.length) return;
        post({ type: 'changes', changes: e.contentChanges.map((c) => ({ from: toPos(c.range.start), to: toPos(c.range.end), insert: c.text })) });
      }),
      panel.onDidChangeViewState((e) => e.webviewPanel.active && this.active.fire(document)),
    ];
    if (panel.active) this.active.fire(document);
    panel.onDidDispose(() => {
      if (this.ready.get(key) === post) this.ready.delete(key); // not another live editor on the same file
      server?.child.kill();
      stopWatch?.();
      subscriptions.forEach((s) => s.dispose());
    });
  }

  /** Open a definition in another file (the webview jumps within its own). */
  private async definition(document: vscode.TextDocument, position: vscode.Position) {
    const [loc] = (await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>('vscode.executeDefinitionProvider', document.uri, position)) ?? [];
    if (!loc) return;
    const [uri, selection] = 'targetUri' in loc ? [loc.targetUri, loc.targetSelectionRange ?? loc.targetRange] : [loc.uri, loc.range];
    this.open(uri, selection.start.line);
  }

  /** Follow a rendered link as the preview does. A target in this file is selected in the webview. Others open in their default editor, like `definition`. */
  private follow(document: vscode.TextDocument, p: Project, { href, line }: { href: string; line?: number }, post: (m: ToLive) => void) {
    return followLink({
      ...linkHost(p),
      open: (path, line) => {
        const uri = vscode.Uri.file(resolve(p.root, path));
        if (uri.fsPath === document.uri.fsPath) post({ type: 'select', at: { line, character: 0 } });
        else this.open(uri, line);
      },
      fileForSlug: (slug) => p.content.fileForSlug(slug),
    }, projectPath(p.root, document.uri), href, line);
  }

  /** References across the project. VS Code's peek view needs a text editor, so pick one from a list. */
  private async references(document: vscode.TextDocument, position: vscode.Position, post: (m: ToLive) => void) {
    const locations = (await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', document.uri, position)) ?? [];
    const items = locations.map((location) => ({ label: `${vscode.workspace.asRelativePath(location.uri)}:${location.range.start.line + 1}`, location }));
    const pick = await vscode.window.showQuickPick(items, { title: 'References' });
    if (!pick) return;
    const { uri, range } = pick.location;
    if (uri.toString() === document.uri.toString()) post({ type: 'select', at: toPos(range.start) });
    else this.open(uri, range.start.line);
  }

  /** Rename across the project. The edit to this file comes back to the webview like any other change. */
  private async rename(document: vscode.TextDocument, position: vscode.Position) {
    const prepared = await vscode.commands
      .executeCommand<{ range: vscode.Range; placeholder: string }>('vscode.prepareRename', document.uri, position)
      .then((r) => r, () => undefined); // not something that can be renamed
    if (!prepared) return;
    const name = await vscode.window.showInputBox({ title: 'Rename', value: prepared.placeholder });
    if (!name) return;
    const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>('vscode.executeDocumentRenameProvider', document.uri, position, name);
    if (edit) await vscode.workspace.applyEdit(edit);
  }
}
