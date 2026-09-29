import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { contentServer } from './built.ts';

const files: Record<string, object> = {
  '/prefix/config.json': { projects: [{ index: 'home', pages: [{ title: 'Part' }, { slug: 'guide-a' }] }] },
  '/prefix/content/home.json': { location: '/index.md', mdast: { type: 'root', children: [] } },
  '/prefix/content/guide-a.json': { location: '/guide/a.md', mdast: { type: 'root', children: [{ type: 'image', url: '/x.png' }] } },
};

test('reads built pages under a path prefix and maps slugs to files', async (t) => {
  const server: Server = createServer((req, res) => {
    const body = files[req.url!];
    res.writeHead(body ? 200 : 404).end(body ? JSON.stringify(body) : 'not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as any).port}/prefix/`;

  const myst = contentServer(base, 'http://assets');
  assert.deepEqual((await myst.pages()).map((p) => p.location), ['/index.md', '/guide/a.md']);
  assert.equal(myst.fileForSlug('guide-a'), 'guide/a.md');
  assert.equal(myst.fileForSlug(''), 'index.md');
  assert.equal(myst.fileForSlug('nope'), undefined);
  assert.equal((await myst.page('guide/a.md'))!.mdast.children[0].url, 'http://assets/x.png');
  assert.equal(await myst.page('missing.md'), null);
  assert.deepEqual(await myst.built('missing.md'), { path: 'missing.md', page: null });
  assert.deepEqual(await contentServer(base + 'nope').built('a.md'), { path: 'a.md', page: null, error: 'not found' });
});
