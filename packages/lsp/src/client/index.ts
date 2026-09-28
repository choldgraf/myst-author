import { jumpToDefinition, languageServerExtensions, LSPClient, type Transport } from '@codemirror/lsp-client';
import { EditorView } from '@codemirror/view';
import { inlayHints } from './inlayHints.ts';

/** A websocket transport that buffers messages until the socket opens. */
function transport(ws: WebSocket): Transport {
  let handlers: ((message: string) => void)[] = [];
  const pending: string[] = [];
  ws.onopen = () => pending.splice(0).forEach((m) => ws.send(m));
  ws.onmessage = (e) => handlers.forEach((h) => h(e.data));
  return {
    send: (m) => (ws.readyState === WebSocket.OPEN ? ws.send(m) : pending.push(m)),
    subscribe: (h) => handlers.push(h),
    unsubscribe: (h) => (handlers = handlers.filter((x) => x !== h)),
  };
}

/**
 * Connect `client` to `url`, and reconnect with backoff when the socket closes or `initialize` fails.
 * Reconnecting re-sends `initialize`, and lsp-client re-opens every attached editor's file.
 */
function keepConnected(client: LSPClient, url: string, delay = 1000) {
  const ws = new WebSocket(url);
  client.connect(transport(ws));
  client.initializing.then(() => (delay = 1000), () => ws.close());
  ws.addEventListener('close', () => {
    client.disconnect(); // a fresh `initializing` promise; requests made meanwhile wait for the next connection
    setTimeout(() => keepConnected(client, url, Math.min(delay * 2, 30000)), delay);
  });
}

// Cmd/Ctrl-click a reference to jump to its target (F12 comes with languageServerExtensions).
const definitionClick = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!(e.metaKey || e.ctrlKey)) return false;
    const pos = view.posAtCoords(e);
    if (pos == null) return false;
    e.preventDefault();
    view.dispatch({ selection: { anchor: pos } });
    return jumpToDefinition(view);
  },
});

/**
 * Connect to the `lsp` bridge of the MyST Author server at `base` (default: the page's own server).
 * Document URIs are built under the project's `file://` URI, which the server reports at `api/root`.
 */
export async function connectLsp(base = location.href) {
  const { uri: root }: { uri: string } = await fetch(new URL('api/root', base)).then((r) => r.json());
  const client = new LSPClient({
    rootUri: root,
    timeout: 20000, // the host starts a language server process per connection, which can take seconds on a busy host (e.g. Binder)
    extensions: [inlayHints(), ...languageServerExtensions(), { editorExtension: definitionClick }], // inlayHints first: serverDiagnostics consumes the notification
  });
  keepConnected(client, new URL('lsp', base).href.replace(/^http/, 'ws'));
  return {
    client,
    root,
    uri: (path: string) => `${root}/${path.split('/').map(encodeURIComponent).join('/')}`,
    path: (uri: string) => (uri.startsWith(root + '/') ? decodeURIComponent(uri.slice(root.length + 1)) : null),
  };
}
