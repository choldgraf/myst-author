import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import * as vscode from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { startMyst } from '@myst-author/mystmd/start';
import { LiveEditor, serverScript, type Project } from './live.ts';
import { MystPreview } from './preview.ts';

let client: LanguageClient | undefined;
let myst: Awaited<ReturnType<typeof startMyst>> | undefined;

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('MyST', { log: true }); // the language client logs to it with `info`, `error`…
  let project: string | undefined;
  let preview: MystPreview | undefined;
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('mystAuthor.openPreview', () =>
      preview ? preview.open() : vscode.window.showInformationMessage('Open a Markdown file in a MyST project (a folder with myst.yml) to preview it.')),
    vscode.commands.registerCommand('mystAuthor.showLog', () => output.show()),
  );

  // The live editor waits for the project's mystmd; the first `start` settles this.
  let onStart!: (p: Project) => void;
  const started = new Promise<Project>((resolve) => (onStart = resolve));

  // Start once we see a file in a MyST project: one that's open now, or the next one the user switches to.
  // Only one project per window: files in a second project still talk to the first project's mystmd.
  const start = async (uri?: vscode.Uri) => {
    const root = uri && projectRoot(uri);
    if (!root || project) return;
    project = root;
    watch.forEach((w) => w.dispose());
    output.appendLine(`Starting mystmd in ${root}`);
    myst = await startMyst(root, (line) => output.appendLine(stripVTControlCharacters(line)));
    // Failing to start is reported by the preview; this is for mystmd dying later, which otherwise looks like a build that never finishes.
    const { ready, exited } = myst;
    ready.then(() => exited.catch((e) => vscode.window.showWarningMessage(`MyST: mystmd stopped (${e.message}). See MyST: Show Log.`)), () => {});
    onStart({ root, myst });
    // The LSP loads the whole project once mystmd has built it; until then it knows the open files.
    const lsp = new LanguageClient(
      'mystAuthor',
      'MyST Author',
      { module: serverScript(context), transport: TransportKind.ipc, args: [`--content-server=${myst.url}`] },
      {
        documentSelector: [{ scheme: 'file', language: 'markdown' }],
        outputChannel: output,
        workspaceFolder: { uri: vscode.Uri.file(root), name: basename(root), index: 0 },
      },
    );
    client = lsp;
    preview = new MystPreview(context, root, myst, (method, params) => lsp.sendRequest(method, params));
    await lsp.start();
  };
  // The live editor starts the project too, for when it opens before any text editor (a restored tab).
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'mystAuthor.live',
      new LiveEditor(context, (uri) => {
        if (!projectRoot(uri)) return;
        start(uri);
        return started;
      }),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.commands.registerCommand('mystAuthor.toggleLive', toggleLive),
  );
  const watch = [
    vscode.window.onDidChangeActiveTextEditor((e) => isMarkdown(e?.document) && start(e!.document.uri)),
    vscode.window.onDidChangeActiveNotebookEditor((e) => start(e?.notebook.uri)),
  ];
  context.subscriptions.push(...watch);
  const open = [...vscode.workspace.notebookDocuments.map((d) => d.uri), ...vscode.workspace.textDocuments.filter(isMarkdown).map((d) => d.uri)];
  start(open.find((uri) => projectRoot(uri)));
}

export async function deactivate() {
  myst?.stop();
  await client?.stop();
}

/** Reopen the active Markdown tab in the live editor, or a live editor tab in the text editor. */
async function toggleLive() {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const input = tab?.input;
  const live = input instanceof vscode.TabInputCustom && input.viewType === 'mystAuthor.live';
  const uri = input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText ? input.uri : undefined;
  if (!tab || !uri) return;
  await vscode.commands.executeCommand('vscode.openWith', uri, live ? 'default' : 'mystAuthor.live');
  await vscode.window.tabGroups.close(tab);
}

const isMarkdown = (d?: vscode.TextDocument) => d?.languageId === 'markdown' && d.uri.scheme === 'file';

/** The folder of the nearest `myst.yml` above a file, within its workspace folder, if any. */
function projectRoot(uri: vscode.Uri) {
  const top = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  if (!top) return;
  for (let dir = dirname(uri.fsPath); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'myst.yml'))) return dir;
    if (dir === top) return;
  }
}
