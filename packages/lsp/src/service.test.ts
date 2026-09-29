import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createService } from './service.ts';

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
