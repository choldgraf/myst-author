import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { contentServer } from 'mystmd-client/content-server';
import { LiveEditor } from './live.ts';
import { MystPreview } from './preview.ts';
import { webviewUrl, type Project } from './project.ts';

export function activate(context: vscode.ExtensionContext) {
  // Activated once; if that fails, say so once and no document has a project.
  const lsp = Promise.resolve(vscode.extensions.getExtension<{ client: LanguageClient; server: string }>('myst-author.mystmd-lsp-vscode')!.activate())
    .catch((e: Error) => void vscode.window.showErrorMessage(`MyST Author: ${e.message}`));
  const projects = new Map<string, PromiseLike<Project>>();

  /**
   * The project `uri` is a page of, from the MyST Language Server extension: its server finds the folder and runs mystmd, and we ask it where they are.
   * Undefined for a file outside every project or one mystmd doesn't build, which leaves the preview and the live editor's language features off.
   * One `Project` per folder: a window can hold several, each with its own content server.
   */
  async function projectFor(uri: vscode.Uri): Promise<Project | undefined> {
    const ext = await lsp;
    if (!ext) return;
    const { client, server } = ext;
    try {
      const { root, contentServer: url, page } = await client.sendRequest<{ root?: string; contentServer?: string; page?: boolean }>('myst/project', { uri: uri.toString() });
      if (!root || !url || !page) return;
      if (!projects.has(root)) {
        // One content server client per project, reached at the URL webviews see.
        projects.set(root, webviewUrl(url).then((assets) => ({ root, server, url, assets, request: (method, params) => client.sendRequest(method, params), content: contentServer(url, assets) })));
      }
      return await projects.get(root);
    } catch {
      // A server that died, or a URL that can't be forwarded: the file just has no project, and the editor still opens.
      // The language server extension reports its own failures, so no message here (this runs on every editor switch).
    }
  }

  const preview = new MystPreview(context, projectFor);
  context.subscriptions.push(
    vscode.commands.registerCommand('mystAuthor.openPreview', () => preview.open()),
    vscode.commands.registerCommand('mystAuthor.toggleLive', toggleLive),
    vscode.window.registerCustomEditorProvider('mystAuthor.live', new LiveEditor(context, projectFor), { webviewOptions: { retainContextWhenHidden: true } }),
  );
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
