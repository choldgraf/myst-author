import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CompletionItemKind, DiagnosticSeverity, SemanticTokensBuilder, SymbolKind, type CompletionItem, type Diagnostic, type Position } from 'vscode-languageserver';
import { directives, roles } from '@myst-author/preview/parse';
import type { createProject } from './project.ts';
import { optionAt, refAt, refsInText, type Ref } from './syntax.ts';
import type { Target } from './index-targets.ts';
import { loadProject, readReferences, resolveXref, splitXref, type XrefEntry, type XrefProject } from './xref.ts';

// The same directives and roles as the preview's parser.
const names = (specs: { name: string; alias?: string[] }[]) => specs.flatMap((s) => [s.name, ...(s.alias ?? [])]);
const directiveNames = names(directives);
const directiveSpecs = new Map(directives.flatMap((d) => names([d]).map((n) => [n, d])));
const roleNames = names(roles);

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

/**
 * Semantic tokens: each reference is a `label`, with its target's kind as a modifier (e.g. `label.figure`).
 * Kinds not listed here get the bare `label` type.
 */
export const semanticTokensLegend = {
  tokenTypes: ['label'],
  tokenModifiers: ['heading', 'figure', 'table', 'equation', 'code', 'quote', 'paragraph', 'proof', 'exercise', 'admonition', 'page'],
};

const rangeOf = (ref: Ref) => ({ start: { line: ref.line, character: ref.start }, end: { line: ref.line, character: ref.end } });

type At = { textDocument: { uri: string }; position: Position };

/**
 * The language server's features, without an LSP connection.
 * `root` is the workspace folder path; `project` indexes the built pages and open files.
 * `onChange` runs when external references finish loading; pass the same callback to `project`, so diagnostics and hints can be refreshed.
 * Each method takes and returns the LSP request's params and result.
 */
export function createService(root: string | undefined, project: ReturnType<typeof createProject>, onChange: () => void) {
  const texts = new Map<string, string>(); // open documents by URI
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  // External projects from myst.yml `project.references`.
  const xrefs: Record<string, XrefProject> = root ? Object.fromEntries(Object.entries(readReferences(root)).map(([key, url]) => [key, { url }])) : {};
  for (const p of Object.values(xrefs)) loadProject(p).then(onChange, (e) => console.error(`[lsp] failed to load ${p.url}: ${e}`));

  // Files are project-relative when inside the workspace (matching the content server's `location`), else absolute paths.
  const toFile = (uri: string) => {
    const path = fileURLToPath(uri);
    return root && !relative(root, path).startsWith('..') ? relative(root, path) : path;
  };
  const toUri = (file: string) => pathToFileURL(root ? resolve(root, file) : file).href;
  const locationOf = (t: Target) => {
    const start = { line: t.line - 1, character: 0 };
    return { uri: toUri(t.file), range: { start, end: start } };
  };

  function workspaceFiles(dir = root): string[] {
    if (!dir) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_build') return [];
      const path = join(dir, e.name);
      return e.isDirectory() ? workspaceFiles(path) : /\.(md|ipynb)$/.test(e.name) ? [path] : [];
    });
  }

  const lookup = () => new Map(project.targets().map((t) => [t.identifier, t]));
  const find = (targets: Map<string, Target>, ref: Ref) => targets.get(ref.target.trim().toLowerCase());

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

  const refs = (uri: string) => refsInText(texts.get(uri) ?? '');
  const refAtCursor = ({ textDocument, position: { line, character } }: At) =>
    refs(textDocument.uri).find((r) => r.line === line && r.start <= character && character <= r.end);

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

  return {
    /** Set an open document's text; the project re-parses it shortly after typing stops, then calls its `onChange`. */
    update(uri: string, text: string) {
      texts.set(uri, text);
      clearTimeout(timers.get(uri));
      timers.set(uri, setTimeout(() => project.setOpen(toFile(uri), text), 150));
    },

    close(uri: string) {
      texts.delete(uri);
      clearTimeout(timers.get(uri));
      project.close(toFile(uri));
    },

    completion({ textDocument, position }: At) {
      const text = texts.get(textDocument.uri);
      if (text === undefined) return [];
      const lines = text.split('\n');
      const opt = optionAt(lines, position.line, position.character);
      if (opt) return optionItems(opt, position.line);
      const ctx = refAt((lines[position.line] ?? '').replace(/\r$/, ''), position.character);
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
            .filter((t) => (ctx.trigger === 'numref' ? t.enumerator : ctx.trigger === 'eq' ? t.kind === 'equation' : true))
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
    },

    hover(at: At) {
      const ref = refAtCursor(at);
      if (ref?.kind === 'xref') {
        const e = xrefEntry(ref);
        return e ? { contents: { kind: 'markdown' as const, value: `**${e.title || e.name || e.page || e.url}** · ${e.kind}\n\n${e.url}` } } : null;
      }
      const t = ref && find(lookup(), ref);
      if (!t) return null;
      return { contents: { kind: 'markdown' as const, value: `**${title(t)}** · ${t.file}\n\n${t.text}` } };
    },

    definition(at: At) {
      const ref = refAtCursor(at);
      if (!ref) return null;
      if (ref.kind === 'doc') return { uri: pathToFileURL(join(dirname(fileURLToPath(at.textDocument.uri)), ref.target)).href, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } };
      const t = find(lookup(), ref);
      return t ? locationOf(t) : null;
    },

    inlayHints({ textDocument }: { textDocument: { uri: string } }) {
      const targets = lookup();
      return refs(textDocument.uri).flatMap((ref) => {
        const t = ref.kind !== 'doc' && ref.kind !== 'xref' && find(targets, ref);
        // An xref link without text renders with the remote title, so show that.
        const label = t ? hint(t) : ref.kind === 'xref' && !ref.text && xrefEntry(ref)?.title;
        return label ? [{ position: { line: ref.line, character: ref.after }, label, paddingLeft: true }] : [];
      });
    },

    semanticTokens({ textDocument }: { textDocument: { uri: string } }) {
      const targets = lookup();
      const builder = new SemanticTokensBuilder();
      for (const ref of refs(textDocument.uri)) {
        if (ref.kind === 'doc') continue; // a file path, not a label
        const kind = ref.kind === 'xref' ? xrefEntry(ref)?.kind : find(targets, ref)?.kind;
        const i = semanticTokensLegend.tokenModifiers.indexOf(kind ?? '');
        builder.push(ref.line, ref.start, ref.end - ref.start, 0, i < 0 ? 0 : 1 << i);
      }
      return builder.build();
    },

    documentLinks({ textDocument }: { textDocument: { uri: string } }) {
      return refs(textDocument.uri).flatMap((ref) => {
        const e = ref.kind === 'xref' && xrefEntry(ref);
        return e ? [{ range: rangeOf(ref), target: e.url }] : [];
      });
    },

    // Labels as workspace symbols, exact matches first (hosts resolve preview `#id` links with this).
    workspaceSymbols({ query }: { query: string }) {
      const q = query.toLowerCase();
      const matches = project.targets().filter((t) => t.identifier.toLowerCase().includes(q));
      matches.sort((a, b) => Number(b.identifier.toLowerCase() === q) - Number(a.identifier.toLowerCase() === q));
      return matches.map((t) => ({ name: t.identifier, kind: SymbolKind.Key, containerName: hint(t), location: locationOf(t) }));
    },

    diagnostics(uri: string): Diagnostic[] {
      const targets = lookup();
      return refs(uri).flatMap((ref) => {
        const message = ref.kind === 'xref' ? xrefProblem(ref)
          : ref.kind !== 'doc' && project.loaded && !find(targets, ref) ? `Unknown reference target \`${ref.target}\``
          : undefined;
        return message ? [{ severity: DiagnosticSeverity.Warning, range: rangeOf(ref), message, source: 'myst' }] : [];
      });
    },
  };
}
