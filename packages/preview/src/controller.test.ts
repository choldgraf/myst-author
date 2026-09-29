import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PreviewController } from './controller.ts';

test('follows preview links to files, labels, and slugs', async () => {
  const calls: unknown[][] = [];
  const preview = new PreviewController({
    current: () => ({ path: 'guide/a.md', text: '', dirty: false }),
    post: () => {},
    open: (path, line) => calls.push(['open', path, line]),
    openExternal: (url) => calls.push(['external', url]),
    findLabel: async (id) => (id === 'fig' ? { path: 'b.md', line: 4 } : undefined),
    warn: (message) => calls.push(['warn', message]),
  });
  preview.pages = { fileForSlug: (slug: string) => (slug === 'c' ? 'guide/c.md' : undefined) } as any;

  for (const href of ['https://x.org', '#fig', '#nope', '../d%20e.md', '/c', '/missing']) {
    await preview.onMessage({ type: 'follow', href, line: href === '#nope' ? 3 : undefined });
  }
  assert.deepEqual(calls, [
    ['external', 'https://x.org'],
    ['open', 'b.md', 4],
    ['open', 'guide/a.md', 2],
    ['open', 'guide/../d e.md', 0],
    ['open', 'guide/c.md', 0],
    ['warn', "Can't follow /missing"],
  ]);
});
