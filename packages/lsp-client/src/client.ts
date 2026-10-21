import { jumpToDefinition, languageServerExtensions, LSPClient, type LSPClientExtension, type Transport } from '@codemirror/lsp-client';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { inlayHints, refreshInlayHints } from 'codemirror-lsp-inlay-hints';

/**
 * A transport over any message channel, such as a webview's postMessage.
 * `post` sends a message, and `listen` registers the one function that receives them.
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
    client.disconnect(); // a fresh `initializing` promise, so requests made meanwhile wait for the next connection
    setTimeout(() => keepConnected(client, url, Math.min(delay * 2, 30000)), delay);
  });
}

// mystmd-lsp publishes diagnostics when a file opens or changes, and when another file or the project index changes.
// Any of these can change a file's hints, so each diagnostics notification requests new hints.
// That replaces the usual timer after each edit, which `inlayHints({ delay: null })` below turns off.
const refreshHintsOnDiagnostics: LSPClientExtension = {
  notificationHandlers: {
    'textDocument/publishDiagnostics': (client, params) => {
      const view = client.workspace.getFile(params.uri)?.getView();
      if (view) refreshInlayHints(view);
      return false; // let serverDiagnostics handle them too
    },
  },
};

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

// Completion icons for MyST. lsp-client turns each LSP kind into a coarse CodeMirror type.
// It drops some kinds: Reference, File, Operator, and Snippet.
// Several LSP kinds map to the same CodeMirror type, so figures and citations get the same icon.
// An lsp-client option to map kinds to types would let figures and citations have separate icons.
const icon = (content: string, fontSize = '90%') => ({ '&:after': { content: `'${content}'`, fontSize } });
const completionIcons = EditorView.theme({
  '.cm-completionIcon:not([class*="cm-completionIcon-"])': icon('#'), // labels, equations, code, files
  '.cm-completionIcon-namespace': icon('§'), // headings, external projects
  '.cm-completionIcon-constant': icon('▣'), // figures, citations
  '.cm-completionIcon-class': icon('▦'), // tables
  '.cm-completionIcon-keyword': icon('{}', '70%'), // directives
  '.cm-completionIcon-property': icon(':'), // directive options
});

// Markdown docs in completion and hover: spacing, and a width that's comfortable to read.
const docsTheme = EditorView.theme({
  // The completion info panel keeps line breaks for plain-text docs, which would add blank lines between the HTML of Markdown docs.
  '.cm-completionInfo .cm-lsp-documentation': { whiteSpace: 'normal' },
  '.cm-tooltip .cm-lsp-documentation :is(p, ul, ol, pre)': { margin: '0 0 0.5em' },
  '.cm-tooltip .cm-lsp-documentation pre': { whiteSpace: 'pre-wrap' },
  '.cm-tooltip .cm-lsp-documentation > :last-child': { marginBottom: 0 },
  '.cm-tooltip.cm-tooltip-hover': { maxWidth: '600px' },
});

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
/** An absolute file or folder path as a file URI, encoded like the document URIs `uri()` below makes, so `path()` can map it back. */
export const fileUri = (path: string) => `file://${encodePath(path)}`;

/**
 * Connect to the language server at `server`.
 * `server` is either a websocket URL relative to the page, or a transport when the host relays messages itself (see `messageTransport`).
 * A URL uses ws:// on an http:// page and wss:// on an https:// one.
 * Document URIs are built under `root`, a `file://` URI chosen by the host.
 */
export function connectLsp(server: string | Transport, root: string) {
  const client = new LSPClient({
    rootUri: root,
    timeout: 20000, // the host starts a language server process per connection, which can take seconds on a busy host (e.g. Binder)
    extensions: [
      inlayHints({ delay: null }),
      refreshHintsOnDiagnostics, // before languageServerExtensions, whose serverDiagnostics consumes the notification
      // LSPClient drops extensions with no `.extension`, which keymap.of() lacks before @codemirror/state 6.7.1 (JupyterLab 4.5 has 6.5).
      // Wrapping them in arrays keeps F2, F12, and Shift+F12 in JupyterLab.
      ...languageServerExtensions().map((e) => ('editorExtension' in e ? e : [e as Extension])),
      { editorExtension: [definitionClick, completionIcons, docsTheme] },
    ],
  });
  if (typeof server === 'string') keepConnected(client, new URL(server, location.href).href.replace(/^http/, 'ws'));
  else client.connect(server);
  return {
    client,
    uri: (path: string) => `${root}/${encodePath(path)}`,
    // The root itself is '': a project's folder can be the host's root.
    path: (uri: string) => (uri === root ? '' : uri.startsWith(root + '/') ? decodeURIComponent(uri.slice(root.length + 1)) : null),
  };
}

export type Lsp = ReturnType<typeof connectLsp>;
