import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { contentServer } from 'mystmd-client/content-server';
import { LiveEditor } from './live.ts';
import { MystPreview } from './preview.ts';
import { webviewUrl, type Project } from './project.ts';

export function activate(context: vscode.ExtensionContext) {
  let preview: MystPreview | undefined;
  // The live editor can open before the project is known (a restored tab), so it gets the promise.
  const started = project().catch((e) => void vscode.window.showErrorMessage(`MyST Author: ${e.message}`));
  started.then((p) => {
    if (p) preview = new MystPreview(context, p);
  });
  context.subscriptions.push(
    vscode.commands.registerCommand('mystAuthor.openPreview', () =>
      preview ? preview.open() : vscode.window.showInformationMessage('Open a MyST project (a folder with myst.yml) to preview it.')),
    vscode.commands.registerCommand('mystAuthor.toggleLive', toggleLive),
    vscode.window.registerCustomEditorProvider('mystAuthor.live', new LiveEditor(context, started), { webviewOptions: { retainContextWhenHidden: true } }),
  );
}

/**
 * The project from the MyST Language Server extension: its server picks the folder and runs mystmd, and we ask it where they are.
 * Undefined outside a MyST project, which leaves the preview and the live editor's language features off.
 */
async function project(): Promise<Project | undefined> {
  const { client, server } = await vscode.extensions.getExtension<{ client: LanguageClient; server: string }>('myst-author.mystmd-lsp-vscode')!.activate();
  const { root, contentServer: url } = await client.sendRequest<{ root?: string; contentServer?: string }>('myst/project');
  if (!root || !url) return;
  // One content server for the preview and every live editor, reached at the URL webviews see.
  const assets = await webviewUrl(url);
  return { root, server, url, assets, request: (method, params) => client.sendRequest(method, params), content: contentServer(url, assets) };
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
