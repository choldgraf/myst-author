#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createConnection, NotebookDocuments, ProposedFeatures, TextDocuments, TextDocumentSyncKind, type WorkDoneProgressServerReporter } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { startMyst } from '@myst-author/mystmd/start';
import { createProject } from './project.ts';
import { createService, semanticTokensLegend } from './service.ts';

// The LSP wiring: features live in service.ts.
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
// Notebooks from clients with notebook sync (VS Code): each Markdown cell is a document.
const notebooks = new NotebookDocuments(TextDocument);
const cells = notebooks.cellTextDocuments;
let service: ReturnType<typeof createService>;
// True until mystmd's first build is indexed; until then there are no project-wide completions or warnings.
let loading = false;
let progress: WorkDoneProgressServerReporter | undefined;
const args = parseArgs({ strict: false, options: { 'content-server': { type: 'string' }, root: { type: 'string' }, myst: { type: 'boolean' } } }).values as { 'content-server'?: string; root?: string; myst?: boolean };

connection.onInitialize(async (params) => {
  const folder = params.workspaceFolders?.[0]?.uri ?? params.rootUri;
  const workspace = params.capabilities.workspace;
  const refresh = () => {
    if (loading && project.loaded) {
      loading = false;
      progress?.done();
    }
    [...documents.all(), ...cells.all()].forEach(({ uri }) => connection.sendDiagnostics({ uri, diagnostics: service.diagnostics(uri) }));
    if (workspace?.inlayHint?.refreshSupport) connection.languages.inlayHint.refresh();
    if (workspace?.semanticTokens?.refreshSupport) connection.languages.semanticTokens.refresh();
  };
  const root = args.root ?? (folder ? fileURLToPath(folder) : undefined);
  // With --myst the server runs mystmd itself, for clients (like Neovim) that don't start it.
  const url = args['content-server'] ?? (args.myst && root ? (await startMyst(root)).url : undefined);
  loading = !!url;
  const project = createProject(url, refresh);
  service = createService(root, project, refresh);
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      notebookDocumentSync: { notebookSelector: [{ notebook: { notebookType: 'jupyter-notebook' }, cells: [{ language: 'markdown' }] }] },
      completionProvider: { triggerCharacters: ['`', '#', '{', '(', '/', ':', '@'] },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      inlayHintProvider: true,
      workspaceSymbolProvider: true,
      documentSymbolProvider: true,
      documentLinkProvider: {},
      semanticTokensProvider: { legend: semanticTokensLegend, full: true },
    },
  };
});

// Show "Loading project" while mystmd builds. Clients without progress support get a no-op reporter.
// ponytail: if the content server never answers, this stays up, which is true: there's no project yet. Add a timeout if that confuses people.
connection.onInitialized(async () => {
  if (!loading) return;
  const p = await connection.window.createWorkDoneProgress();
  if (!loading) return; // loaded while we waited
  progress = p;
  p.begin('MyST', undefined, 'Loading project');
});

connection.onCompletion((p) => service.completion(p));
connection.onHover((p) => service.hover(p));
connection.onDefinition((p) => service.definition(p));
connection.onReferences((p) => service.references(p));
connection.onPrepareRename((p) => service.prepareRename(p));
connection.onRenameRequest((p) => service.rename(p));
connection.languages.inlayHint.on((p) => service.inlayHints(p));
connection.languages.semanticTokens.on((p) => service.semanticTokens(p));
connection.onDocumentLinks((p) => service.documentLinks(p));
connection.onWorkspaceSymbol((p) => service.workspaceSymbols(p));
connection.onDocumentSymbol((p) => service.documentSymbols(p));

// Diagnostics are sent when the project changes (after the service re-parses an edited document), not on every keystroke.
for (const docs of [documents, cells]) {
  docs.onDidChangeContent(({ document }) => service.update(document.uri, document.getText()));
  docs.onDidClose(({ document }) => {
    service.close(document.uri);
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
  });
}

documents.listen(connection);
notebooks.listen(connection);
connection.listen();
