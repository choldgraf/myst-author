import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sha256 } from '@myst-author/mystmd/built';
import { listMarkdown, resolveInside, writeUnlessChanged } from './files.ts';

test('listMarkdown finds .md files and skips build/hidden/node_modules dirs', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'myst-author-'));
  for (const d of ['sub', '_build', '.git', 'node_modules']) mkdirSync(path.join(root, d));
  for (const f of ['index.md', 'sub/a.md', 'sub/b.txt', '_build/x.md', '.git/y.md', 'node_modules/z.md'])
    writeFileSync(path.join(root, f), '');
  assert.deepEqual(await listMarkdown(root), ['index.md', 'sub/a.md']);
});

test('resolveInside refuses paths outside the project and non-markdown files', () => {
  assert.equal(resolveInside('/proj', 'a/b.md'), path.resolve('/proj/a/b.md'));
  assert.throws(() => resolveInside('/proj', '../etc/passwd.md'));
  assert.throws(() => resolveInside('/proj', 'myst.yml'));
});

test('writeUnlessChanged refuses to overwrite a file that changed since the browser read it', async () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'myst-author-')), 'a.md');
  writeFileSync(file, 'disk');
  assert.equal(await writeUnlessChanged(file, 'mine', await sha256('read')), false);
  assert.equal(readFileSync(file, 'utf8'), 'disk');
  assert.equal(await writeUnlessChanged(file, 'mine', await sha256('disk')), true);
  assert.equal(readFileSync(file, 'utf8'), 'mine');
  assert.equal(await writeUnlessChanged(file, 'last'), true); // no hash: the tab-close save
});
