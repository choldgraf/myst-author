import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listMarkdown, resolveInside } from './files.ts';

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
