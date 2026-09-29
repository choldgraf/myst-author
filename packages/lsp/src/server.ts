#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { createConnection, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createProject } from './project.ts';
import { createService } from './service.ts';

// The LSP wiring: features live in service.ts.
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
let service: ReturnType<typeof createService>;

connection.onInitialize((params) => {
  const folder = params.workspaceFolders?.[0]?.uri ?? params.rootUri;
  const refreshHints = params.capabilities.workspace?.inlayHint?.refreshSupport;
  const refresh = () => {
    documents.all().forEach(({ uri }) => connection.sendDiagnostics({ uri, diagnostics: service.diagnostics(uri) }));
    if (refreshHints) connection.languages.inlayHint.refresh();
  };
  service = createService(folder ? fileURLToPath(folder) : undefined, createProject(params.initializationOptions?.contentServer, refresh), refresh);
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ['`', '#', '{', '(', '/', ':'] },
      hoverProvider: true,
      definitionProvider: true,
      inlayHintProvider: true,
      workspaceSymbolProvider: true,
      documentLinkProvider: {},
    },
  };
});

connection.onCompletion((p) => service.completion(p));
connection.onHover((p) => service.hover(p));
connection.onDefinition((p) => service.definition(p));
connection.languages.inlayHint.on((p) => service.inlayHints(p));
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
