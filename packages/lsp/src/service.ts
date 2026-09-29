import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CompletionItemKind, DiagnosticSeverity, ErrorCodes, ResponseError, SemanticTokensBuilder, SymbolKind, type CompletionItem, type Diagnostic, type DocumentSymbol, type Position, type TextEdit } from 'vscode-languageserver';
import { directives, roles } from '@myst-author/mystmd/parse';
import { authorYear, readBibliography, type BibEntry } from './cite.ts';
import type { createProject } from './project.ts';
import { labelDefinition, nameAt, optionAt, refAt, refsInText, type Ref } from './syntax.ts';
import type { Target } from './index-targets.ts';
import { loadProject, readReferences, resolveXref, splitXref, type XrefEntry, type XrefProject } from './xref.ts';

// The same directives and roles as the preview's parser.
const names = (specs: { name: string; alias?: string[] }[]) => specs.flatMap((s) => [s.name, ...(s.alias ?? [])]);
const byName = <T extends { name: string; alias?: string[] }>(specs: T[]) => new Map(specs.flatMap((s) => names([s]).map((n) => [n, s])));
const directiveNames = names(directives);
const directiveSpecs = byName(directives);
const roleNames = names(roles);
const roleSpecs = byName(roles);

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
  tokenModifiers: ['heading', 'figure', 'table', 'equation', 'code', 'quote', 'paragraph', 'proof', 'exercise', 'admonition', 'page', 'citation'],
};

const rangeOf = (ref: Pick<Ref, 'line' | 'start' | 'end'>) => ({ start: { line: ref.line, character: ref.start }, end: { line: ref.line, character: ref.end } });

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

  // A document's path. Notebook cells are documents with the notebook's path and a fragment for the cell:
  // `file:///nb.ipynb#<cell id>` from JupyterLab, `vscode-notebook-cell:/nb.ipynb#...` from VS Code.
  const pathOf = (uri: string) => fileURLToPath('file:' + uri.slice(uri.indexOf(':') + 1));
  // Files are project-relative when inside the workspace (matching the content server's `location`), else absolute paths.
  const toFile = (uri: string) => {
    const path = pathOf(uri);
    return root && !relative(root, path).startsWith('..') ? relative(root, path) : path;
  };
  // Citations from the project's .bib files, read once on startup.
  const bib = root && existsSync(root) ? readBibliography(root, workspaceFiles(root, /\.bib$/)) : { entries: [], complete: false };
  const citations = new Map(bib.entries.map((e) => [e.key, e]));
  const bibLocation = (e: BibEntry) => ({ uri: pathToFileURL(e.file).href, range: { start: { line: e.line, character: 0 }, end: { line: e.line, character: 0 } } });

  const toUri = (file: string) => pathToFileURL(root ? resolve(root, file) : file).href;
  // mystmd resolves file paths relative to the current file, or to the project root when they start with `/`.
  const fileOf = (uri: string, path: string) => (path.startsWith('/') && root ? join(root, path) : join(dirname(pathOf(uri)), path));
  const locationOf = (t: Target) => {
    const start = { line: t.line - 1, character: 0 };
    return { uri: t.uri ?? toUri(t.file), range: { start, end: start } };
  };
  // Targets in an open document: its own live parse, or its file's built targets until that's ready.
  const inDocument = (t: Target, uri: string) => (t.uri ? t.uri === uri : t.file === toFile(uri));

  function workspaceFiles(dir = root, pattern = /\.(md|ipynb)$/): string[] {
    if (!dir) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_build') return [];
      const path = join(dir, e.name);
      return e.isDirectory() ? workspaceFiles(path, pattern) : pattern.test(e.name) ? [path] : [];
    });
  }

  const lookup = () => new Map(project.targets().map((t) => [t.identifier, t]));
  const find = (targets: Map<string, Target>, ref: Ref) => targets.get(ref.target.trim().toLowerCase());
  // mystmd reads `@key` and `{cite}` keys as citations first, and only falls back to labels when there's no such citation.
  const citation = (ref: Ref) => (ref.kind === 'cite' ? citations.get(ref.target) : undefined);

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

  // Open documents' unsaved text, else the file on disk.
  const source = (uri: string) => {
    try {
      return texts.get(uri) ?? readFileSync(fileURLToPath(uri), 'utf8');
    } catch {
      return '';
    }
  };
  const isLabel = (ref: Ref) => ref.kind !== 'doc' && ref.kind !== 'path' && ref.kind !== 'xref' && !citation(ref);

  /** The project label under the cursor, on a reference or where it's defined, and the span of its name there. */
  function labelAtCursor(at: At) {
    const { line, character } = at.position;
    const ref = refAtCursor(at);
    const def = labelDefinition(texts.get(at.textDocument.uri)?.split('\n')[line] ?? '');
    let hit;
    if (ref) hit = isLabel(ref) ? ref : undefined;
    else if (def && def.start <= character && character <= def.end) hit = { ...def, line };
    if (!hit) return;
    const target = lookup().get(hit.target.trim().toLowerCase());
    return target && { target, range: rangeOf(hit) };
  }

  /** Where a label is written. The definition closest to the target's line, since built directives can report a line inside them. */
  function definitionOf(t: Target, uri = t.uri ?? toUri(t.file)) {
    const defs = source(uri).split('\n').flatMap((text, line) => {
      const d = labelDefinition(text);
      return d?.target.toLowerCase() === t.identifier ? [{ ...d, line }] : [];
    });
    const d = defs.sort((a, b) => Math.abs(a.line - t.line + 1) - Math.abs(b.line - t.line + 1))[0];
    return d && { uri, range: rangeOf(d) };
  }

  /** Every reference to a label in the workspace's Markdown files and open documents. */
  function labelRefs(identifier: string) {
    const files = root && existsSync(root) ? workspaceFiles(root, /\.md$/) : [];
    const uris = new Set([...files.map((f) => pathToFileURL(f).href), ...texts.keys()]);
    return [...uris].flatMap((uri) =>
      refsInText(source(uri)).filter((r) => isLabel(r) && r.target.trim().toLowerCase() === identifier).map((r) => ({ uri, range: rangeOf(r) })),
    );
  }

  /** mystmd's docs for the directive, directive option, or role name under the cursor. */
  function specHover({ textDocument, position }: At) {
    const n = nameAt((texts.get(textDocument.uri) ?? '').split('\n'), position.line, position.character);
    if (!n) return null;
    const spec: { doc?: string; arg?: { doc?: string } } | undefined =
      n.kind === 'option'
        ? Object.entries(directiveSpecs.get(n.directive)?.options ?? {}).find(([k, o]) => k === n.name || o.alias?.includes(n.name))?.[1]
        : (n.kind === 'directive' ? directiveSpecs : roleSpecs).get(n.name);
    const doc = [spec?.doc, spec?.arg?.doc && `**Argument**: ${spec.arg.doc}`].filter(Boolean).join('\n\n');
    const name = n.kind === 'option' ? `:${n.name}:` : `{${n.name}}`;
    return doc ? { contents: { kind: 'markdown' as const, value: `**${name}**\n\n${doc}` } } : null;
  }

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
      timers.set(uri, setTimeout(() => project.setOpen(toFile(uri), text, uri), 150));
    },

    close(uri: string) {
      texts.delete(uri);
      clearTimeout(timers.get(uri));
      project.close(uri);
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

      const citeItems = () =>
        bib.entries.map((e) => item(e.key, CompletionItemKind.Value, { detail: [authorYear(e), e.title].filter(Boolean).join(' · '), filterText: `${e.key} ${e.author ?? ''} ${e.title ?? ''}` }));
      const labelItem = (t: Target) => item(t.identifier, CompletionItemKind.Reference, { detail: `${title(t)} · ${t.file}`, documentation: t.text, filterText: `${t.identifier} ${t.text}` });

      switch (ctx.trigger) {
        case 'cite':
          return citeItems();
        case 'at':
          return [...citeItems(), ...project.targets().map(labelItem)];
        case 'ref':
        case 'numref':
        case 'eq':
        case 'link-hash':
          return project
            .targets()
            .filter((t) => (ctx.trigger === 'numref' ? t.enumerator : ctx.trigger === 'eq' ? t.kind === 'equation' : true))
            .map(labelItem);
        case 'doc':
        case 'link-path':
        case 'path': {
          // mystmd resolves `{doc}`, `[](path)` and directive file arguments relative to the current file. Directives take any file.
          const here = dirname(pathOf(textDocument.uri));
          return workspaceFiles(root, ctx.trigger === 'path' ? /./ : undefined).map((f) => item(relative(here, f), CompletionItemKind.File));
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
          const all = (xrefs[key]?.entries ?? []).filter((e) => has(e) && `${e.name} ${e.title ?? ''}`.toLowerCase().includes(q));
          const matches = [...all.filter((e) => e.name.toLowerCase().startsWith(q)), ...all.filter((e) => !e.name.toLowerCase().startsWith(q))];
          // Sphinx inventories can have tens of thousands of entries: send the best 200 and ask the client to re-query as the user types.
          const items = matches.slice(0, 200).map((e) => item(e.name, CompletionItemKind.Reference, { detail: e.title && e.title !== e.name ? `${e.title} · ${e.kind}` : e.kind, filterText: `${e.name} ${e.title ?? ''}` }));
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
      if (!ref) return specHover(at);
      if (ref.kind === 'xref') {
        const e = xrefEntry(ref);
        return e ? { contents: { kind: 'markdown' as const, value: `**${e.title || e.name || e.page || e.url}** · ${e.kind}\n\n${e.url}` } } : null;
      }
      const c = citation(ref);
      if (c) return { contents: { kind: 'markdown' as const, value: `**${authorYear(c) || c.key}** · ${relative(root ?? '', c.file)}\n\n${c.title ?? ''}` } };
      const t = find(lookup(), ref);
      if (!t) return null;
      return { contents: { kind: 'markdown' as const, value: `**${title(t)}** · ${t.file}\n\n${t.text}` } };
    },

    definition(at: At) {
      const ref = refAtCursor(at);
      if (!ref) return null;
      if (ref.kind === 'doc' || ref.kind === 'path') return { uri: pathToFileURL(fileOf(at.textDocument.uri, ref.target)).href, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } };
      const c = citation(ref);
      if (c) return bibLocation(c);
      const t = find(lookup(), ref);
      return t ? locationOf(t) : null;
    },

    references(at: At & { context: { includeDeclaration: boolean } }) {
      const t = labelAtCursor(at)?.target;
      if (!t) return null;
      const refs = labelRefs(t.identifier);
      return at.context.includeDeclaration ? [definitionOf(t) ?? locationOf(t), ...refs] : refs;
    },

    // Only labels whose definition we can find in the source can be renamed: not implicit heading labels, closed notebooks, citations or xrefs.
    prepareRename(at: At) {
      const hit = labelAtCursor(at);
      return hit && definitionOf(hit.target) ? hit.range : null;
    },

    rename(at: At & { newName: string }) {
      const hit = labelAtCursor(at);
      const def = hit && definitionOf(hit.target);
      if (!def) return null;
      if (!/^[^\s()<>`{}[\]]+$/.test(at.newName)) throw new ResponseError(ErrorCodes.InvalidParams, `\`${at.newName}\` isn't a valid label`);
      const changes: Record<string, TextEdit[]> = {};
      for (const { uri, range } of [def, ...labelRefs(hit.target.identifier)]) (changes[uri] ??= []).push({ range, newText: at.newName });
      return { changes };
    },

    inlayHints({ textDocument }: { textDocument: { uri: string } }) {
      const targets = lookup();
      return refs(textDocument.uri).flatMap((ref) => {
        const t = isLabel(ref) && find(targets, ref);
        // An xref link without text renders with the remote title, so show that.
        const label = t ? hint(t) : ref.kind === 'xref' && !ref.text && xrefEntry(ref)?.title;
        return label ? [{ position: { line: ref.line, character: ref.after }, label, paddingLeft: true }] : [];
      });
    },

    semanticTokens({ textDocument }: { textDocument: { uri: string } }) {
      const targets = lookup();
      const builder = new SemanticTokensBuilder();
      for (const ref of refs(textDocument.uri)) {
        if (ref.kind === 'doc' || ref.kind === 'path') continue; // a file path, not a label
        const kind = ref.kind === 'xref' ? xrefEntry(ref)?.kind : citation(ref) ? 'citation' : find(targets, ref)?.kind;
        const i = semanticTokensLegend.tokenModifiers.indexOf(kind ?? '');
        builder.push(ref.line, ref.start, ref.end - ref.start, 0, i < 0 ? 0 : 1 << i);
      }
      return builder.build();
    },

    documentLinks({ textDocument }: { textDocument: { uri: string } }) {
      return refs(textDocument.uri).flatMap((ref) => {
        const file = ref.kind === 'path' && fileOf(textDocument.uri, ref.target);
        if (file && existsSync(file)) return [{ range: rangeOf(ref), target: pathToFileURL(file).href }];
        const e = ref.kind === 'xref' && xrefEntry(ref);
        return e ? [{ range: rangeOf(ref), target: e.url }] : [];
      });
    },

    // Labels as workspace symbols, matched by label or text, exact matches first (hosts resolve preview `#id` links with this).
    workspaceSymbols({ query }: { query: string }) {
      const q = query.toLowerCase();
      const matches = project.targets().filter((t) => `${t.identifier} ${t.text}`.toLowerCase().includes(q));
      matches.sort((a, b) => Number(b.identifier.toLowerCase() === q) - Number(a.identifier.toLowerCase() === q));
      return matches.map((t) => ({ name: t.identifier, kind: SymbolKind.Key, containerName: hint(t), location: locationOf(t) }));
    },

    // The page outline: headings nested by level, with labeled blocks (e.g. "Figure 1 · caption") under their section.
    // A heading's range runs to the next heading at its level or above, so clients can show the section the cursor is in.
    documentSymbols({ textDocument }: { textDocument: { uri: string } }) {
      const text = texts.get(textDocument.uri);
      if (text === undefined) return [];
      const lines = text.split('\n');
      const endOf = (line: number) => ({ line, character: lines[line]?.length ?? 0 });
      const top: DocumentSymbol[] = [];
      const open: { depth: number; children: DocumentSymbol[]; symbol?: DocumentSymbol }[] = [{ depth: 0, children: top }];
      const close = (line: number) => { const { symbol } = open.pop()!; if (symbol) symbol.range.end = endOf(line); };
      for (const t of project.targets().filter((t) => inDocument(t, textDocument.uri))) {
        const at = () => ({ line: t.line - 1, character: 0 });
        const children: DocumentSymbol[] = [];
        const symbol: DocumentSymbol = {
          name: t.depth ? t.text : t.text ? `${title(t)} · ${t.text}` : title(t),
          detail: t.depth ? undefined : t.identifier,
          kind: t.depth ? SymbolKind.String : SymbolKind.Key,
          range: { start: at(), end: at() },
          selectionRange: { start: at(), end: at() },
          children,
        };
        if (t.depth) while (open.at(-1)!.depth >= t.depth) close(t.line - 2);
        open.at(-1)!.children.push(symbol);
        if (t.depth) open.push({ depth: t.depth, children, symbol });
      }
      while (open.length > 1) close(lines.length - 1);
      return top;
    },

    diagnostics(uri: string): Diagnostic[] {
      const targets = lookup();
      const problems = refs(uri).flatMap((ref) => {
        const message = ref.kind === 'xref' ? xrefProblem(ref)
          : ref.kind === 'path' ? (existsSync(fileOf(uri, ref.target)) ? undefined : `File not found: \`${ref.target}\``)
          // Citation keys are only checked when every .bib file was read, and DOIs (`@10.1234/x`) resolve without one.
          : ref.kind === 'cite' ? (project.loaded && bib.complete && !citation(ref) && !find(targets, ref) && !/^10\.\d+\//.test(ref.target) ? `Unknown citation or reference target \`${ref.target}\`` : undefined)
          : ref.kind !== 'doc' && project.loaded && !find(targets, ref) ? `Unknown reference target \`${ref.target}\``
          : undefined;
        return message ? [{ severity: DiagnosticSeverity.Warning, range: rangeOf(ref), message, source: 'myst' }] : [];
      });
      // Labels in this file that are defined more than once in the project. Like mystmd, not implicit heading labels.
      const explicit = project.loaded ? project.targets().filter((t) => !t.implicit) : [];
      const duplicates = explicit.filter((t) => inDocument(t, uri)).flatMap((t) => {
        const others = explicit.filter((o) => o !== t && o.identifier === t.identifier);
        if (!others.length) return [];
        const range = definitionOf(t, uri)?.range ?? rangeOf({ line: t.line - 1, start: 0, end: (texts.get(uri)?.split('\n')[t.line - 1] ?? '').length });
        const message = `Duplicate label \`${t.identifier}\`, also defined in ${[...new Set(others.map((o) => o.file))].join(', ')}`;
        return [{ severity: DiagnosticSeverity.Warning, range, message, source: 'myst' }];
      });
      return [...problems, ...duplicates];
    },
  };
}
