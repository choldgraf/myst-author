#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  ProposedFeatures,
  SymbolKind,
  TextDocuments,
  TextDocumentSyncKind,
  type CompletionItem,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { defaultDirectives } from 'myst-directives';
import { defaultRoles } from 'myst-roles';
import { buttonRole } from 'myst-ext-button';
import { cardDirective } from 'myst-ext-card';
import { exerciseDirectives } from 'myst-ext-exercise';
import { gridDirectives } from 'myst-ext-grid';
import { proofDirective } from 'myst-ext-proof';
import { tabDirectives } from 'myst-ext-tabs';
import { createProject } from './project.ts';
import { optionAt, refAt, refsInText, type Ref } from './syntax.ts';
import type { Target } from './index-targets.ts';
import { loadProject, readReferences, resolveXref, splitXref, type XrefEntry, type XrefProject } from './xref.ts';

// Same extensions as @myst-author/preview's parser (mystmd's defaults).
const names = (specs: { name: string; alias?: string[] }[]) => specs.flatMap((s) => [s.name, ...(s.alias ?? [])]);
const directives = [...defaultDirectives, cardDirective, ...gridDirectives, ...tabDirectives, proofDirective, ...exerciseDirectives];
const directiveNames = names(directives);
const directiveSpecs = new Map(directives.flatMap((d) => names([d]).map((n) => [n, d])));
const roleNames = names([...defaultRoles, buttonRole]);

const enumerated = new Set(['figure', 'table', 'code', 'equation']);

/** "Figure 1", "Equation (1)", "Section" */
function title(t: Target) {
  const kind = t.kind === 'heading' ? 'Section' : t.kind[0].toUpperCase() + t.kind.slice(1);
  if (!t.enumerator) return kind;
  return t.kind === 'equation' ? `${kind} (${t.enumerator})` : `${kind} ${t.enumerator}`;
}

/** The ghost text shown after a resolved reference. */
function hint(t: Target) {
  if (t.kind === 'equation' && t.enumerator) return `(${t.enumerator})`;
  return t.enumerator ? title(t) : `${title(t)}: ${t.text}`;
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
let root: string | undefined; // workspace folder path
let project: ReturnType<typeof createProject>;
let xrefs: Record<string, XrefProject> = {}; // external projects from myst.yml `project.references`

// Files are project-relative when inside the workspace (matching the content server's `location`), else absolute paths.
const toFile = (uri: string) => {
  const path = fileURLToPath(uri);
  return root && !relative(root, path).startsWith('..') ? relative(root, path) : path;
};
const toUri = (file: string) => pathToFileURL(root ? join(root, file) : file).href;

function workspaceFiles(dir = root): string[] {
  if (!dir) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_build') return [];
    const path = join(dir, e.name);
    return e.isDirectory() ? workspaceFiles(path) : /\.(md|ipynb)$/.test(e.name) ? [path] : [];
  });
}

function lookup(): Map<string, Target> {
  return new Map(project.targets().map((t) => [t.identifier, t]));
}
const find = (targets: Map<string, Target>, ref: Ref) => targets.get(ref.target.trim().toLowerCase());

const rangeOf = (ref: Ref) => ({ start: { line: ref.line, character: ref.start }, end: { line: ref.line, character: ref.end } });

function xrefEntry(ref: Ref): XrefEntry | undefined {
  const { key, page, hash } = splitXref(ref.target);
  const p = xrefs[key];
  return p?.entries && resolveXref(p, page, hash);
}

function xrefProblem(ref: Ref): string | undefined {
  const { key, page, hash } = splitXref(ref.target);
  const p = xrefs[key];
  if (!p) return `Unknown external project \`${key}\` (add it to \`project.references\` in myst.yml)`;
  // Only once the inventory has loaded: offline or unreachable projects must not produce false errors.
  if (p.entries && !resolveXref(p, page, hash)) return `\`${ref.target}\` not found in ${key} (${p.url})`;
}

function refUnderCursor(uri: string, line: number, character: number) {
  const doc = documents.get(uri);
  if (!doc) return;
  return refsInText(doc.getText()).find((r) => r.line === line && r.start <= character && character <= r.end);
}

connection.onInitialize((params) => {
  const folder = params.workspaceFolders?.[0]?.uri ?? params.rootUri;
  if (folder) root = fileURLToPath(folder);
  const refreshHints = params.capabilities.workspace?.inlayHint?.refreshSupport;
  const refresh = () => {
    documents.all().forEach(validate);
    if (refreshHints) connection.languages.inlayHint.refresh();
  };
  project = createProject(params.initializationOptions?.contentServer, refresh);
  if (root) {
    xrefs = Object.fromEntries(Object.entries(readReferences(root)).map(([key, url]) => [key, { url }]));
    for (const p of Object.values(xrefs)) loadProject(p).then(refresh, (e) => console.error(`[lsp] failed to load ${p.url}: ${e}`));
  }
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

connection.onCompletion(({ textDocument, position }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  const lineText = doc.getText({ start: { line: position.line, character: 0 }, end: { line: position.line + 1, character: 0 } });
  const opt = optionAt(doc.getText().split('\n'), position.line, position.character);
  if (opt) return optionItems(opt, position.line);
  const ctx = refAt(lineText.replace(/\r?\n$/, ''), position.character);
  if (!ctx) return [];
  const range = { start: { line: position.line, character: ctx.start }, end: { line: position.line, character: ctx.end } };
  const item = (label: string, kind: CompletionItemKind, extra: Partial<CompletionItem> = {}): CompletionItem => ({
    label,
    kind,
    textEdit: { range, newText: label },
    ...extra,
  });

  switch (ctx.trigger) {
    case 'ref':
    case 'numref':
    case 'eq':
    case 'link-hash':
      return project
        .targets()
        .filter((t) => (ctx.trigger === 'numref' ? enumerated.has(t.kind) : ctx.trigger === 'eq' ? t.kind === 'equation' : true))
        .map((t) => item(t.identifier, CompletionItemKind.Reference, { detail: `${title(t)} · ${t.file}`, documentation: t.text }));
    case 'doc':
    case 'link-path': {
      // mystmd resolves both `{doc}` and `[](path)` relative to the current file.
      const here = dirname(fileURLToPath(textDocument.uri));
      return workspaceFiles().map((f) => item(relative(here, f), CompletionItemKind.File));
    }
    case 'xref-key':
      return Object.entries(xrefs).flatMap(([key, p]) => [
        item(key, CompletionItemKind.Module, { detail: p.url }),
        ...(p.entries ?? []).filter((e) => e.kind === 'page' && e.page !== '/').map((e) => item(key + e.page, CompletionItemKind.File, { detail: e.url })),
      ]);
    case 'xref-target': {
      const { key, page } = splitXref(ctx.key!);
      const q = ctx.prefix.toLowerCase();
      const has = (e: XrefEntry) => e.name && (page ? e.page === page : !e.implicit);
      const all = (xrefs[key]?.entries ?? []).filter((e) => has(e) && e.name.toLowerCase().includes(q));
      const matches = [...all.filter((e) => e.name.toLowerCase().startsWith(q)), ...all.filter((e) => !e.name.toLowerCase().startsWith(q))];
      // Sphinx inventories can have tens of thousands of entries: send the best 200 and ask the client to re-query as the user types.
      const items = matches.slice(0, 200).map((e) => item(e.name, CompletionItemKind.Reference, { detail: e.title && e.title !== e.name ? `${e.title} · ${e.kind}` : e.kind }));
      return { isIncomplete: matches.length > 200, items };
    }
    case 'directive':
      return directiveNames.map((n) => item(n, CompletionItemKind.Keyword));
    case 'role':
      return roleNames.map((n) => item(n, CompletionItemKind.Function));
  }
});

/** Options of the enclosing directive (from its mystmd spec), minus ones already set. */
function optionItems(opt: NonNullable<ReturnType<typeof optionAt>>, line: number): CompletionItem[] {
  const options = directiveSpecs.get(opt.directive)?.options ?? {};
  const range = { start: { line, character: opt.start }, end: { line, character: opt.end } };
  return Object.entries(options)
    .filter(([key, o]) => ![key, ...(o.alias ?? [])].some((k) => opt.used.includes(k)))
    .map(([key, o]) => ({
      label: key,
      kind: CompletionItemKind.Property,
      detail: typeof o.type === 'string' ? o.type : o.type?.name?.toLowerCase(),
      documentation: o.doc,
      textEdit: { range, newText: `${key}: ` },
    }));
}

connection.onHover(({ textDocument, position }) => {
  const ref = refUnderCursor(textDocument.uri, position.line, position.character);
  if (ref?.kind === 'xref') {
    const e = xrefEntry(ref);
    return e ? { contents: { kind: 'markdown', value: `**${e.title || e.name || e.page || e.url}** · ${e.kind}\n\n${e.url}` } } : null;
  }
  const t = ref && find(lookup(), ref);
  if (!t) return null;
  return { contents: { kind: 'markdown', value: `**${title(t)}** · ${t.file}\n\n${t.text}` } };
});

connection.onDefinition(({ textDocument, position }) => {
  const ref = refUnderCursor(textDocument.uri, position.line, position.character);
  if (!ref) return null;
  if (ref.kind === 'doc') return { uri: pathToFileURL(join(dirname(fileURLToPath(textDocument.uri)), ref.target)).href, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } };
  const t = find(lookup(), ref);
  if (!t) return null;
  const start = { line: t.line - 1, character: 0 };
  return { uri: toUri(t.file), range: { start, end: start } };
});

connection.languages.inlayHint.on(({ textDocument }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  const targets = lookup();
  return refsInText(doc.getText()).flatMap((ref) => {
    const t = ref.kind !== 'doc' && ref.kind !== 'xref' && find(targets, ref);
    // An xref link without text renders with the remote title, so show that.
    const label = t ? hint(t) : ref.kind === 'xref' && !ref.text && xrefEntry(ref)?.title;
    return label ? [{ position: { line: ref.line, character: ref.after }, label, paddingLeft: true }] : [];
  });
});

connection.onDocumentLinks(({ textDocument }) => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return [];
  return refsInText(doc.getText()).flatMap((ref) => {
    const e = ref.kind === 'xref' && xrefEntry(ref);
    return e ? [{ range: rangeOf(ref), target: e.url }] : [];
  });
});

// Labels as workspace symbols, exact matches first (the web app resolves preview `#id` links with this).
connection.onWorkspaceSymbol(({ query }) => {
  const q = query.toLowerCase();
  const matches = project.targets().filter((t) => t.identifier.toLowerCase().includes(q));
  matches.sort((a, b) => Number(b.identifier.toLowerCase() === q) - Number(a.identifier.toLowerCase() === q));
  return matches.map((t) => {
    const start = { line: t.line - 1, character: 0 };
    return { name: t.identifier, kind: SymbolKind.Key, containerName: hint(t), location: { uri: toUri(t.file), range: { start, end: start } } };
  });
});

function validate(doc: TextDocument) {
  const targets = lookup();
  const diagnostics = refsInText(doc.getText()).flatMap((ref) => {
    const message = ref.kind === 'xref' ? xrefProblem(ref)
      : ref.kind !== 'doc' && project.loaded && !find(targets, ref) ? `Unknown reference target \`${ref.target}\``
      : undefined;
    return message ? [{ severity: DiagnosticSeverity.Warning, range: rangeOf(ref), message, source: 'myst' }] : [];
  });
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

// Re-parse open documents shortly after typing stops; the project calls `validate` on every open document when targets change.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
documents.onDidChangeContent(({ document }) => {
  clearTimeout(timers.get(document.uri));
  timers.set(document.uri, setTimeout(() => project.setOpen(toFile(document.uri), document.getText()), 150));
});
documents.onDidClose(({ document }) => {
  clearTimeout(timers.get(document.uri));
  project.close(toFile(document.uri));
  connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
});

documents.listen(connection);
connection.listen();
