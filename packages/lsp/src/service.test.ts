import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createProject } from './project.ts';
import { createService, semanticTokensLegend } from './service.ts';

const root = '/book';
const uri = 'file:///book/index.md';
const text = 'See {numref}`Fig-Built` and {ref}`missing`.\n{ref}`notes`\n';
const built = { identifier: 'fig-built', kind: 'figure', text: 'A plot', enumerator: '2', file: 'chapter/plots.md', line: 5 };
const outside = { identifier: 'notes', kind: 'heading', text: 'Notes', file: '/elsewhere/notes.md', line: 1 };

// A loaded project, as `createProject` returns once the content server has answered.
function stubProject() {
  const opened: string[] = [];
  return { opened, loaded: true, targets: () => [built, outside], setOpen: (file: string) => opened.push(file), close() {} };
}

test('a loaded project resolves built targets and flags unknown ones', () => {
  const service = createService(root, stubProject(), () => {});
  service.update(uri, text);

  assert.deepEqual(service.diagnostics(uri).map((d) => d.message), ['Unknown reference target `missing`']);
  assert.deepEqual(service.inlayHints({ textDocument: { uri } }).map((h) => h.label), ['Figure 2', 'Section: Notes']);
  assert.deepEqual(service.definition({ textDocument: { uri }, position: { line: 0, character: 15 } }), {
    uri: 'file:///book/chapter/plots.md',
    range: { start: { line: 4, character: 0 }, end: { line: 4, character: 0 } },
  });
  // Open files outside the workspace keep absolute paths.
  assert.equal(service.definition({ textDocument: { uri }, position: { line: 1, character: 7 } })?.uri, 'file:///elsewhere/notes.md');
});

test('labels match by text', () => {
  const service = createService(root, stubProject(), () => {});
  assert.deepEqual(service.workspaceSymbols({ query: 'plot' }).map((s) => s.name), ['fig-built']);
});

test('the outline nests sections by level, with numbered blocks under their section', () => {
  const at = (identifier: string, line: number, extra: object) => ({ identifier, text: identifier, file: 'index.md', line, ...extra });
  const targets = [
    at('intro', 1, { kind: 'heading', depth: 1 }),
    at('methods', 3, { kind: 'heading', depth: 2 }),
    at('fig-a', 5, { kind: 'figure', enumerator: '1' }),
    at('results', 7, { kind: 'heading', depth: 2 }),
  ];
  const service = createService(root, { loaded: true, targets: () => targets, setOpen() {}, close() {} }, () => {});
  service.update(uri, '# intro\n\n## methods\n\n:::{figure}\n:::\n## results\nlast line');
  const tree = (symbols: any[]): any[] => symbols.map((s) => [s.name, s.range.end.line, ...tree(s.children)]);
  assert.deepEqual(tree(service.documentSymbols({ textDocument: { uri } })), [['intro', 7, ['methods', 5, ['Figure 1 · fig-a', 4]], ['results', 7]]]);
});

test('references are label tokens with their target kind as a modifier', () => {
  const service = createService(root, stubProject(), () => {});
  service.update(uri, text);
  const mod = (kind: string) => 1 << semanticTokensLegend.tokenModifiers.indexOf(kind);
  // Delta-encoded [line, start, length, type, modifiers]: `Fig-Built` (a figure), `missing` (unknown), `notes` (a heading).
  assert.deepEqual(service.semanticTokens({ textDocument: { uri } }).data, [0, 13, 9, 0, mod('figure'), 0, 21, 7, 0, 0, 1, 6, 5, 0, mod('heading')]);
});

test('edits reach the project once typing stops, as project-relative files', async () => {
  const project = stubProject();
  const service = createService(root, project, () => {});
  service.update(uri, 'a');
  service.update(uri, 'ab');
  service.update('file:///elsewhere/notes.md', 'c');
  assert.deepEqual(project.opened, []);
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(project.opened, ['index.md', '/elsewhere/notes.md']);
});

test('`@key` and `{cite}` resolve to citations first, then labels', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lsp-'));
  writeFileSync(join(dir, 'refs.bib'), '@article{nelson1977,\n  author = {Nelson, Ted and Smith, J.},\n  title = {{Computer} Lib},\n  year = 1977\n}\n');
  const service = createService(dir, stubProject(), () => {});
  const doc = pathToFileURL(join(dir, 'index.md')).href;
  service.update(doc, 'See @fig-built and [@nelson1977], {cite}`nelson1977, nope`.\n@');
  assert.deepEqual(service.inlayHints({ textDocument: { uri: doc } }).map((h) => h.label), ['Figure 2']);
  assert.deepEqual(service.definition({ textDocument: { uri: doc }, position: { line: 0, character: 25 } }), {
    uri: pathToFileURL(join(dir, 'refs.bib')).href,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  });
  assert.deepEqual(service.diagnostics(doc).map((d) => d.message), ['Unknown citation or reference target `nope`']);
  const items = service.completion({ textDocument: { uri: doc }, position: { line: 1, character: 1 } }) as any[];
  assert.deepEqual(items.map((i) => [i.label, i.detail]).slice(0, 2), [['nelson1977', 'Nelson et al. 1977 · Computer Lib'], ['fig-built', 'Figure 2 · chapter/plots.md']]);
});

// A workspace on disk: `a.md` defines the labels, `b.md` (also open, with unsaved edits) and `c.md` reference them.
function labelWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'lsp-'));
  const a = '(sec)=\n# Section\n\n:::{figure} x.png\n:label: Fig-One\n\nThe caption\n:::\n';
  writeFileSync(join(dir, 'a.md'), a);
  writeFileSync(join(dir, 'b.md'), 'See {ref}`sec`.\n');
  writeFileSync(join(dir, 'c.md'), 'See <#fig-one>.\n');
  // The built figure reports its caption's line, not the `:label:` line.
  const targets = [
    { identifier: 'sec', kind: 'heading', text: 'Section', file: 'a.md', line: 2 },
    { identifier: 'fig-one', kind: 'figure', text: 'The caption', enumerator: '1', file: 'a.md', line: 7 },
  ];
  const service = createService(dir, { loaded: true, targets: () => targets, setOpen() {}, close() {} }, () => {});
  const uri = (f: string) => pathToFileURL(join(dir, f)).href;
  service.update(uri('a.md'), a);
  service.update(uri('b.md'), 'See @FIG-ONE and {numref}`fig-one`.\n');
  const spans = (locs: { uri: string; range: { start: { line: number; character: number } } }[]) =>
    locs.map((l) => `${l.uri.split('/').at(-1)}:${l.range.start.line}:${l.range.start.character}`).sort();
  return { service, uri, spans };
}

test('find references from a reference, across files, preferring unsaved text', () => {
  const { service, uri, spans } = labelWorkspace();
  const refs = service.references({ textDocument: { uri: uri('b.md') }, position: { line: 0, character: 6 }, context: { includeDeclaration: true } });
  assert.deepEqual(spans(refs!), ['a.md:4:8', 'b.md:0:26', 'b.md:0:5', 'c.md:0:6']);
});

test('rename a label from its definition, and not citations or unknown labels', () => {
  const { service, uri, spans } = labelWorkspace();
  const at = { textDocument: { uri: uri('a.md') }, position: { line: 4, character: 10 } };
  assert.deepEqual(service.prepareRename(at), { start: { line: 4, character: 8 }, end: { line: 4, character: 15 } });
  const { changes } = service.rename({ ...at, newName: 'fig-plot' })!;
  assert.deepEqual(spans(Object.entries(changes).flatMap(([u, edits]) => edits.map((e) => ({ uri: u, ...e })))), ['a.md:4:8', 'b.md:0:26', 'b.md:0:5', 'c.md:0:6']);
  service.update(uri('b.md'), '{doc}`a.md` @nope');
  assert.equal(service.prepareRename({ textDocument: { uri: uri('b.md') }, position: { line: 0, character: 7 } }), null);
  assert.equal(service.prepareRename({ textDocument: { uri: uri('b.md') }, position: { line: 0, character: 14 } }), null);
});

test('hover shows mystmd docs for directives, options and roles, but references come first', () => {
  const service = createService(root, stubProject(), () => {});
  service.update(uri, '```{include} x.md\n:language: python\n```\n{kbd}`Ctrl` {numref}`fig-built`\n');
  const hover = (line: number, character: number) => service.hover({ textDocument: { uri }, position: { line, character } })?.contents.value;
  assert.match(hover(0, 5)!, /^\*\*\{include\}\*\*\n\nAllows you to include .*\n\n\*\*Argument\*\*: The file path/);
  assert.match(hover(1, 3)!, /^\*\*:language:\*\*\n\nThe language of the code/);
  assert.match(hover(3, 2)!, /^\*\*\{kbd\}\*\*/);
  assert.match(hover(3, 26)!, /^\*\*Figure 2\*\*/);
});

test('directive file arguments: links, completion, and a warning when missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lsp-'));
  mkdirSync(join(dir, 'img'));
  writeFileSync(join(dir, 'img', 'plot.png'), '');
  const service = createService(dir, stubProject(), () => {});
  const doc = pathToFileURL(join(dir, 'index.md')).href;
  service.update(doc, '```{figure} img/plot.png\n```\n```{image} /img/plot.png\n```\n```{include} missing.md\n```\n```{figure} ');
  const png = pathToFileURL(join(dir, 'img', 'plot.png')).href;
  assert.deepEqual(service.documentLinks({ textDocument: { uri: doc } }).map((l) => l.target), [png, png]);
  assert.deepEqual(service.diagnostics(doc).map((d) => d.message), ['File not found: `missing.md`']);
  assert.deepEqual((service.completion({ textDocument: { uri: doc }, position: { line: 6, character: 12 } }) as any[]).map((i) => i.label), ['img/plot.png']);
});

test('duplicate labels are flagged, but not implicit heading labels', () => {
  const heading = (file: string, line: number) => ({ identifier: 'examples', kind: 'heading', text: 'Examples', file, line, implicit: true });
  const targets = [{ ...built, file: 'index.md', line: 2 }, built, heading('index.md', 4), heading('other.md', 1)];
  const service = createService(root, { loaded: true, targets: () => targets, setOpen() {}, close() {} }, () => {});
  service.update(uri, '(fig-built)=\n# Built\n\n## Examples\n');
  assert.deepEqual(service.diagnostics(uri).map((d) => [d.message, d.range.start.line, d.range.start.character]), [['Duplicate label `fig-built`, also defined in chapter/plots.md', 0, 1]]);
});

test('notebook cells are documents in their notebook file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lsp-'));
  mkdirSync(join(dir, 'nb'));
  writeFileSync(join(dir, 'nb', 'plot.png'), '');
  const project = createProject(undefined, () => {});
  const service = createService(dir, project, () => {});
  // Cell URIs as JupyterLab sends them; VS Code's `vscode-notebook-cell:` URIs have the same path.
  const nb = pathToFileURL(join(dir, 'nb', 'analysis.ipynb')).href;
  service.update(`${nb}#a`, '(results)=\n# Results\n');
  service.update(`${nb}#b`, 'See {ref}`results`.\n```{figure} ');
  await new Promise((r) => setTimeout(r, 200));

  assert.deepEqual(project.targets().map((t) => [t.identifier, t.file]), [['results', 'nb/analysis.ipynb']]);
  assert.deepEqual(service.definition({ textDocument: { uri: `${nb}#b` }, position: { line: 0, character: 12 } })?.uri, `${nb}#a`);
  assert.deepEqual(service.documentSymbols({ textDocument: { uri: `${nb}#b` } }), []);
  assert.deepEqual((service.completion({ textDocument: { uri: `${nb}#b` }, position: { line: 1, character: 12 } }) as any[]).map((i) => i.label), ['plot.png']);
});
