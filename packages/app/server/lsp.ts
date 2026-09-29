import { spawn } from 'node:child_process';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { lspArgs } from '@myst-author/lsp/args';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import { WebSocketServer } from 'ws';

// Production runs the bundle from `npm run build`, which answers `initialize` several times sooner than the TypeScript source.
const serverScript = fileURLToPath(import.meta.resolve(process.env.NODE_ENV === 'production' ? '@myst-author/lsp/dist/server.cjs' : '@myst-author/lsp/server'));

/** Returns an upgrade handler that bridges each websocket to its own `@myst-author/lsp` process over stdio. */
export function lspBridge(root: string, contentServer: string) {
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws) => {
    const child = spawn(process.execPath, [serverScript, '--stdio', ...lspArgs(contentServer, root)], { stdio: ['pipe', 'pipe', 'inherit'] });
    const stop = () => child.kill();
    process.on('exit', stop);
    child.on('exit', () => { process.off('exit', stop); ws.close(); });
    child.on('error', () => ws.close());
    ws.on('close', stop);

    const writer = new StreamMessageWriter(child.stdin);
    new StreamMessageReader(child.stdout).listen((msg) => ws.send(JSON.stringify(msg)));
    ws.on('message', (data) => {
      // One bad frame closes this connection, not the whole host server.
      try { writer.write(JSON.parse(String(data))); } catch { ws.close(1007); }
    });
  });
  return (req: IncomingMessage, socket: Duplex, head: Buffer) =>
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
}
