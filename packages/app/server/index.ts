#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createProxyServer } from 'http-proxy-3';
import sirv from 'sirv';
import { startMyst } from '@myst-author/mystmd/start';
import { listMarkdown, resolveInside } from './files.ts';
import { lspBridge } from './lsp.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { help: { type: 'boolean', short: 'h' } } });
if (values.help || positionals.length > 1) {
  console.log('Usage: myst-author [folder]\n\nEdit the MyST project in folder (default: the current folder).\nEnvironment: PORT, MYST_BIN, NO_OPEN=1');
  process.exit(values.help ? 0 : 1);
}
const root = path.resolve(positionals[0] ?? '.');
const port = Number(process.env.PORT ?? 4321);

// The content server for the built preview. Until it's up, or once it stops, /myst/* answers 503 with this reason.
// Only for a myst.yml in this folder: mystmd would otherwise search parent folders for one and serve that project instead.
const myst = existsSync(path.join(root, 'myst.yml')) ? await startMyst(root) : undefined;
let mystDown = myst ? 'myst starting' : 'no myst.yml in this folder';
myst?.ready
  .then(() => {
    mystDown = '';
    return myst.exited;
  })
  .catch((err) => (mystDown = err.message));
const lsp = lspBridge(root, myst?.url); // the LSP loads the project once myst is up; until then it knows open documents
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
    return proxy.web(req, res, { target: myst!.url });
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
    return proxy.ws(req, socket, head, { target: myst!.url });
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
