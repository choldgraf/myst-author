import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { lspArgs } from '@myst-author/lsp/args';
import { spawnLsp } from '@myst-author/lsp/spawn';
import { WebSocketServer } from 'ws';

// Production runs the bundle from `npm run build`, which answers `initialize` several times sooner than the TypeScript source.
const serverScript = fileURLToPath(import.meta.resolve(process.env.NODE_ENV === 'production' ? '@myst-author/lsp/dist/server.cjs' : '@myst-author/lsp/server'));

/** Returns an upgrade handler that bridges each websocket to its own `@myst-author/lsp` process (see `spawnLsp`). */
export function lspBridge(root: string, contentServer: string) {
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws) => {
    const { child, send } = spawnLsp(serverScript, lspArgs(contentServer, root), (m) => ws.send(m));
    const stop = () => child.kill();
    process.on('exit', stop);
    child.on('exit', () => { process.off('exit', stop); ws.close(); });
    child.on('error', () => ws.close());
    ws.on('close', stop);
    ws.on('message', (data) => {
      // One bad frame closes this connection, not the whole host server.
      try { send(String(data)); } catch { ws.close(1007); }
    });
  });
  return (req: IncomingMessage, socket: Duplex, head: Buffer) =>
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
}
