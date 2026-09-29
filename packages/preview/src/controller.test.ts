import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PreviewController, type PreviewHost } from './controller.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve));

function host(calls: unknown[][]): PreviewHost {
  return {
    current: () => ({ path: 'guide/a.md', text: 'hi', dirty: false }),
    post: (m) => calls.push(['post', m]),
    open: (path, line) => calls.push(['open', path, line]),
    openExternal: (url) => calls.push(['external', url]),
    findLabel: async (id) => (id === 'fig' ? { path: 'b.md', line: 4 } : undefined),
    warn: (message) => calls.push(['warn', message]),
  };
}

test('sends the build on start, on rebuilds, and on file changes until disposed', async () => {
  const calls: unknown[][] = [];
  let reload = () => {};
  let stopped = false;
  const server = {
    page: async (path: string) => ({ location: '/' + path }),
    watch: (onReload: () => void) => { reload = onReload; return () => { stopped = true; }; },
  };
  const preview = new PreviewController(host(calls), Promise.resolve(server as any));
  await tick();
  reload();
  await tick();
  preview.sendFile();
  await tick();
  const built = ['post', { type: 'built', path: 'guide/a.md', page: { location: '/guide/a.md' } }];
  assert.deepEqual(calls, [built, built, ['post', { type: 'text', path: 'guide/a.md', text: 'hi', dirty: false }], built]);
  preview.dispose();
  assert.ok(stopped);

  // A failed mystmd is reported, then treated like no mystmd.
  calls.length = 0;
  new PreviewController(host(calls), Promise.reject(new Error('exited')));
  await tick();
  assert.deepEqual(calls, [['warn', "mystmd didn't start: exited"], ['post', { type: 'built', path: 'guide/a.md', page: null, error: 'mystmd not found' }]]);
});

test("drops a build that arrives after the host has moved to another file", async () => {
  const calls: unknown[][] = [];
  let path = 'a.md';
  let finishA = () => {};
  const server = {
    page: (p: string) => new Promise((resolve) => (p === 'a.md' ? (finishA = () => resolve({ location: '/a' })) : resolve({ location: '/b' }))),
    watch: () => () => {},
  };
  const preview = new PreviewController({ ...host(calls), current: () => ({ path, text: '', dirty: false }) }, Promise.resolve(server as any));
  await tick();
  path = 'b.md';
  preview.sendFile();
  await tick();
  finishA();
  await tick();
  assert.deepEqual(calls.filter((c: any) => c[1].type === 'built').at(-1), ['post', { type: 'built', path: 'b.md', page: { location: '/b' } }]);
});

test('follows preview links to files, labels, and slugs', async () => {
  const calls: unknown[][] = [];
  const server = { fileForSlug: (slug: string) => ({ '': 'index.md', c: 'guide/c.md' })[slug], page: async () => null, watch: () => () => {} };
  const preview = new PreviewController(host(calls), Promise.resolve(server as any));
  await tick();
  calls.length = 0;

  for (const href of ['https://x.org', '#fig', '#nope', '../d%20e.md', '/c', '/', '/missing']) {
    await preview.onMessage({ type: 'follow', href, line: href === '#nope' ? 3 : undefined });
  }
  assert.deepEqual(calls, [
    ['external', 'https://x.org'],
    ['open', 'b.md', 4],
    ['open', 'guide/a.md', 2],
    ['open', 'd e.md', 0],
    ['open', 'guide/c.md', 0],
    ['open', 'index.md', 0],
    ['warn', "Can't follow /missing"],
  ]);
});
