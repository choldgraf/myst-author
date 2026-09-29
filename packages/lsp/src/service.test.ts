import { test } from 'node:test';
import assert from 'node:assert/strict';
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
