#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createConnection, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { startMyst } from './myst.ts';
import { createProject } from './project.ts';
import { createService, semanticTokensLegend } from './service.ts';

// The LSP wiring: features live in service.ts.
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
let service: ReturnType<typeof createService>;
const args = parseArgs({ strict: false, options: { 'content-server': { type: 'string' }, root: { type: 'string' }, myst: { type: 'boolean' } } }).values as { 'content-server'?: string; root?: string; myst?: boolean };

connection.onInitialize(async (params) => {
  const folder = params.workspaceFolders?.[0]?.uri ?? params.rootUri;
  const workspace = params.capabilities.workspace;
  const refresh = () => {
    documents.all().forEach(({ uri }) => connection.sendDiagnostics({ uri, diagnostics: service.diagnostics(uri) }));
    if (workspace?.inlayHint?.refreshSupport) connection.languages.inlayHint.refresh();
    if (workspace?.semanticTokens?.refreshSupport) connection.languages.semanticTokens.refresh();
  };
  const root = args.root ?? (folder ? fileURLToPath(folder) : undefined);
  // With --myst the server runs mystmd itself, for clients (like Neovim) that don't start it.
  const url = args['content-server'] ?? (args.myst && root ? (await startMyst(root)).url : undefined);
  service = createService(root, createProject(url, refresh), refresh);
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ['`', '#', '{', '(', '/', ':'] },
      hoverProvider: true,
      definitionProvider: true,
      inlayHintProvider: true,
      workspaceSymbolProvider: true,
      documentLinkProvider: {},
      semanticTokensProvider: { legend: semanticTokensLegend, full: true },
    },
  };
});

connection.onCompletion((p) => service.completion(p));
connection.onHover((p) => service.hover(p));
connection.onDefinition((p) => service.definition(p));
connection.languages.inlayHint.on((p) => service.inlayHints(p));
connection.languages.semanticTokens.on((p) => service.semanticTokens(p));
connection.onDocumentLinks((p) => service.documentLinks(p));
connection.onWorkspaceSymbol((p) => service.workspaceSymbols(p));

// Diagnostics are sent when the project changes (after the service re-parses an edited document), not on every keystroke.
documents.onDidChangeContent(({ document }) => service.update(document.uri, document.getText()));
documents.onDidClose(({ document }) => {
  service.close(document.uri);
  connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});

documents.listen(connection);
connection.listen();
