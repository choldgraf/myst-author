import { spawn } from 'node:child_process';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import { WebSocketServer } from 'ws';

const serverScript = fileURLToPath(import.meta.resolve('@myst-author/lsp/src/server.ts'));

/** Returns an upgrade handler that bridges each websocket to its own `@myst-author/lsp` process over stdio. */
export function lspBridge(root: string, contentServer: Promise<string | undefined>) {
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws) => {
    const child = spawn(process.execPath, [serverScript, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] });
    const stop = () => child.kill();
    process.on('exit', stop);
    child.on('exit', () => { process.off('exit', stop); ws.close(); });
    child.on('error', () => ws.close());
    ws.on('close', stop);

    const writer = new StreamMessageWriter(child.stdin);
    new StreamMessageReader(child.stdout).listen((msg) => ws.send(JSON.stringify(msg)));
    // The browser doesn't know the project's path or the content server, so fill them in on `initialize`.
    // Messages are queued so nothing overtakes `initialize` while it waits for myst.
    let queue = Promise.resolve();
    ws.on('message', (data) => {
      queue = queue.then(async () => {
        const msg = JSON.parse(String(data));
        if (msg.method === 'initialize') {
          msg.params.rootUri = pathToFileURL(root).href;
          msg.params.initializationOptions = { ...msg.params.initializationOptions, contentServer: await contentServer };
        }
        await writer.write(msg);
      });
    });
  });
  return (req: IncomingMessage, socket: Duplex, head: Buffer) =>
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
}
