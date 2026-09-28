import { jumpToDefinition, languageServerExtensions, LSPClient, type Transport } from '@codemirror/lsp-client';
import { EditorView } from 'codemirror';
import { wsUrl } from './api.ts';
import { inlayHints } from './inlayHints.ts';

/** A websocket transport that buffers messages until the socket opens. */
function transport(url: string): Transport {
  const ws = new WebSocket(url);
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

/** Connect to the host's `lsp` bridge. Document URIs are built under the project's `file://` URI, which the host reports at `api/root`. */
export async function connectLsp() {
  const { uri: root }: { uri: string } = await fetch('api/root').then((r) => r.json());
  const client = new LSPClient({
    rootUri: root,
    timeout: 20000, // `initialize` waits for mystmd's first build on the host
    extensions: [inlayHints(), ...languageServerExtensions(), { editorExtension: definitionClick }], // inlayHints first: serverDiagnostics consumes the notification
  }).connect(transport(wsUrl('lsp')));
  return {
    client,
    uri: (path: string) => `${root}/${path.split('/').map(encodeURIComponent).join('/')}`,
    path: (uri: string) => (uri.startsWith(root + '/') ? decodeURIComponent(uri.slice(root.length + 1)) : null),
  };
}
