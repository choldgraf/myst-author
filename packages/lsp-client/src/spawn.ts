import { fork } from 'node:child_process';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';

/**
 * Start the language server at `script` with `args`, talking JSON-RPC over stdio.
 * `script` is the server's source or a bundle, and `args` are its options, such as `--content-server=<url>`.
 * `onMessage` gets each message from the server as a JSON string.
 * `send` takes one, and throws if it isn't JSON.
 * Hosts relay these to a CodeMirror language client: the web editor over a websocket, VS Code over a webview's postMessage.
 */
export function spawnLsp(script: string, args: string[], onMessage: (message: string) => void) {
  // fork, not spawn: it runs `script` with this process's Node, which inside VS Code is Electron's.
  const child = fork(script, ['--stdio', ...args], { stdio: ['pipe', 'pipe', 'inherit', 'ipc'] });
  const writer = new StreamMessageWriter(child.stdin!);
  new StreamMessageReader(child.stdout!).listen((m) => onMessage(JSON.stringify(m)));
  return { child, send: (message: string) => writer.write(JSON.parse(message)) };
}
