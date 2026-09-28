import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { startMyst } from '../../app/server/myst.ts';
import { MystPreview } from './preview.ts';

let client: LanguageClient | undefined;
let myst: ReturnType<typeof startMyst> | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const folder = vscode.workspace.workspaceFolders?.find((f) => existsSync(join(f.uri.fsPath, 'myst.yml')));
  const root = folder?.uri.fsPath;
  const port = root ? contentServer(root) : Promise.resolve(undefined);

  const preview = new MystPreview(context, root, port);
  context.subscriptions.push(vscode.commands.registerCommand('mystAuthor.openPreview', () => preview.open()));

  // Wait for the content server so the LSP indexes the whole project from the start.
  const p = await port;
  client = new LanguageClient(
    'mystAuthor',
    'MyST Author',
    { module: context.asAbsolutePath('dist/lsp.js'), transport: TransportKind.ipc },
    {
      documentSelector: [{ scheme: 'file', language: 'markdown' }],
      initializationOptions: { contentServer: p && `http://localhost:${p}` },
    },
  );
  await client.start();
}

export async function deactivate() {
  myst?.stop();
  await client?.stop();
}

/** Start `myst start --headless` in `root`; resolves with its port, or undefined if mystmd is missing or slow. */
function contentServer(root: string): Promise<number | undefined> {
  myst = startMyst(root);
  const timeout = new Promise<undefined>((resolve) => setTimeout(resolve, 60_000));
  return Promise.race([myst.ready, timeout]).catch(() => undefined);
}
