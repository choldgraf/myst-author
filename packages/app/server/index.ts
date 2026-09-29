import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createProxyServer } from 'http-proxy-3';
import sirv from 'sirv';
import { startMyst } from '@myst-author/lsp/myst';
import { listMarkdown, resolveInside } from './files.ts';
import { lspBridge } from './lsp.ts';

const root = path.resolve(process.argv[2] ?? '.');
const port = Number(process.env.PORT ?? 4321);

// The content server for the built preview. Until it's up, /myst/* answers 503 with this reason.
const myst = await startMyst(root);
let mystDown = 'myst starting';
myst.ready.then(
  () => (mystDown = ''),
  (err) => (mystDown = err.message),
);
const lsp = lspBridge(root, myst.url); // the LSP loads the project once myst is up; until then it knows open documents
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit()); // runs the 'exit' hook that stops myst
const proxy = createProxyServer();
proxy.on('error', (err, _req, res) => {
  if ('writeHead' in res) res.writeHead(502).end(String(err));
  else res.destroy();
});

async function readBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

// No auth: the server only listens on 127.0.0.1. A host that exposes it more widely adds its own auth in front.
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname.startsWith('/myst/')) {
    if (mystDown) return res.writeHead(503).end(mystDown);
    req.url = req.url!.slice('/myst'.length);
    return proxy.web(req, res, { target: myst.url });
  }
  if (pathname === '/api/root') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ uri: pathToFileURL(root).href }));
  }
  if (pathname !== '/api/files' && !pathname.startsWith('/api/files/')) return app(req, res);
  try {
    const rel = decodeURIComponent(pathname.slice('/api/files/'.length));
    if (!rel) {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(await listMarkdown(root)));
    }
    const abs = resolveInside(root, rel);
    if (req.method === 'PUT') {
      await writeFile(abs, await readBody(req));
      res.statusCode = 204;
      return res.end();
    }
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(await readFile(abs, 'utf8'));
  } catch (err) {
    res.statusCode = 400;
    res.end(String(err));
  }
});

// Websocket routes. Anything unmatched is left alone: Vite handles its own HMR upgrades (by protocol).
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/myst/socket') {
    if (mystDown) return socket.destroy();
    req.url = '/socket';
    return proxy.ws(req, socket, head, { target: myst.url });
  }
  if (req.url === '/lsp') return lsp(req, socket, head);
});

// Production serves the `npm run build` output; dev mode compiles on the fly with hot reload.
const app = process.env.NODE_ENV === 'production'
  ? sirv(path.resolve(import.meta.dirname, '../dist'), { single: true })
  : (await import('vite').then(({ createServer }) => createServer({
    root: path.resolve(import.meta.dirname, '..'),
    server: { middlewareMode: true, hmr: { server } }, // HMR shares our port, so one proxied port is enough
    appType: 'spa',
  }))).middlewares;

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`myst-author: editing ${root}\n  ${url}`);
  if (process.platform === 'darwin' && !process.env.NO_OPEN) spawn('open', [url]);
});
