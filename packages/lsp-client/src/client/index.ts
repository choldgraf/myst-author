import { jumpToDefinition, languageServerExtensions, LSPClient, type Transport } from '@codemirror/lsp-client';
import { EditorView } from '@codemirror/view';
import { inlayHints } from './inlayHints.ts';

/**
 * A transport over any message channel, such as a webview's postMessage.
 * `post` sends a message; `listen` registers the one function that receives them.
 */
export function messageTransport(post: (message: string) => void, listen: (receive: (message: string) => void) => void): Transport {
  let handlers: ((message: string) => void)[] = [];
  listen((m) => handlers.forEach((h) => h(m)));
  return {
    send: post,
    subscribe: (h) => handlers.push(h),
    unsubscribe: (h) => (handlers = handlers.filter((x) => x !== h)),
  };
}

/** A websocket transport that buffers messages until the socket opens. */
function socketTransport(ws: WebSocket) {
  const pending: string[] = [];
  ws.onopen = () => pending.splice(0).forEach((m) => ws.send(m));
  return messageTransport(
    (m) => (ws.readyState === WebSocket.OPEN ? ws.send(m) : pending.push(m)),
    (receive) => (ws.onmessage = (e) => receive(e.data)),
  );
}

/**
 * Connect `client` to `url`, and reconnect with backoff when the socket closes or `initialize` fails.
 * Reconnecting re-sends `initialize`, and lsp-client re-opens every attached editor's file.
 */
function keepConnected(client: LSPClient, url: string, delay = 1000) {
  const ws = new WebSocket(url);
  client.connect(socketTransport(ws));
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

// Completion icons for MyST. lsp-client turns each LSP kind into a coarse CodeMirror type, and drops some (Reference, File, Operator, Snippet).
// ponytail: types are shared, so figures and citations look alike; an lsp-client option to map kinds would separate them.
const icon = (content: string, fontSize = '90%') => ({ '&:after': { content: `'${content}'`, fontSize } });
const completionIcons = EditorView.theme({
  '.cm-completionIcon:not([class*="cm-completionIcon-"])': icon('#'), // labels, equations, code, files
  '.cm-completionIcon-namespace': icon('§'), // headings, external projects
  '.cm-completionIcon-constant': icon('▣'), // figures, citations
  '.cm-completionIcon-class': icon('▦'), // tables
  '.cm-completionIcon-keyword': icon('{}', '70%'), // directives
  '.cm-completionIcon-property': icon(':'), // directive options
});

/**
 * Connect to the language server at `server`: a websocket URL relative to the page (http(s) means ws(s)),
 * or a transport when the host relays messages itself (see `messageTransport`).
 * Document URIs are built under `root`, a `file://` URI chosen by the host.
 */
export function connectLsp(server: string | Transport, root: string) {
  const client = new LSPClient({
    rootUri: root,
    timeout: 20000, // the host starts a language server process per connection, which can take seconds on a busy host (e.g. Binder)
    extensions: [inlayHints(), ...languageServerExtensions(), { editorExtension: [definitionClick, completionIcons] }], // inlayHints first: serverDiagnostics consumes the notification
  });
  if (typeof server === 'string') keepConnected(client, new URL(server, location.href).href.replace(/^http/, 'ws'));
  else client.connect(server);
  return {
    client,
    uri: (path: string) => `${root}/${path.split('/').map(encodeURIComponent).join('/')}`,
    path: (uri: string) => (uri.startsWith(root + '/') ? decodeURIComponent(uri.slice(root.length + 1)) : null),
  };
}
