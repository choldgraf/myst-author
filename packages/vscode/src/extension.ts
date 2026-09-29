import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import * as vscode from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { lspArgs, startMyst } from '@myst-author/lsp/myst';
import { MystPreview } from './preview.ts';

let client: LanguageClient | undefined;
let myst: Awaited<ReturnType<typeof startMyst>> | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const root = projectRoot();
  myst = root ? await startMyst(root) : undefined;

  const preview = new MystPreview(context, root, myst);
  context.subscriptions.push(vscode.commands.registerCommand('mystAuthor.openPreview', () => preview.open()));

  // The LSP loads the whole project once mystmd has built it; until then it knows the open files.
  client = new LanguageClient(
    'mystAuthor',
    'MyST Author',
    { module: context.asAbsolutePath('dist/lsp.js'), transport: TransportKind.ipc, args: lspArgs(myst?.url) },
    {
      documentSelector: [{ scheme: 'file', language: 'markdown' }],
      workspaceFolder: root ? { uri: vscode.Uri.file(root), name: basename(root), index: 0 } : undefined,
    },
  );
  await client.start();
}

export async function deactivate() {
  myst?.stop();
  await client?.stop();
}

/** The folder of the nearest `myst.yml` above the notebook or Markdown file that activated us, if any. */
function projectRoot() {
  // In a notebook, the active text editor is a cell, whose URI isn't a file in the workspace.
  const uri = vscode.window.activeNotebookEditor?.notebook.uri
    ?? (vscode.window.activeTextEditor?.document ?? vscode.workspace.textDocuments.find((d) => d.languageId === 'markdown'))?.uri;
  const top = uri && vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  if (!uri || !top) return;
  for (let dir = dirname(uri.fsPath); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'myst.yml'))) return dir;
    if (dir === top) return;
  }
}
