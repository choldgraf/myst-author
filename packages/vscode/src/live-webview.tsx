import { markdown } from '@codemirror/lang-markdown';
import { Compartment, Prec, Transaction, type Text } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { basicSetup, EditorView } from 'codemirror';
import { myst } from 'codemirror-lang-myst';
import { connectLsp, messageTransport } from '@myst-author/lsp/client';
import { bodyStart, livePreview, pageLook, showBuilt } from '@myst-author/preview/live';
import type { Change, FromLive, Pos, ToLive } from './live.ts';

declare function acquireVsCodeApi(): { postMessage(message: FromLive): void };
const vscode = acquireVsCodeApi();
// VS Code adds theme-colored defaults for code, kbd, and blockquote; live blocks use only myst-theme's styles.
document.getElementById('_defaultStyles')?.remove();

const toPos = (doc: Text, offset: number): Pos => {
  const line = doc.lineAt(offset);
  return { line: line.number - 1, character: offset - line.from };
};
const toOffset = (doc: Text, { line, character }: Pos) => doc.line(line + 1).from + character;

const lsp = new Compartment();
let receive: (message: string) => void = () => {};

/** Start a language client, talking to the server the extension started for this webview. */
function connect(view: EditorView, root: string, uri: string) {
  const l = connectLsp(messageTransport((message) => vscode.postMessage({ type: 'lsp', message }), (r) => (receive = r)), root);
  // A definition in another file opens in VS Code, which asks its own language client where it is.
  l.client.workspace.displayFile = () => {
    vscode.postMessage({ type: 'definition', at: toPos(view.state.doc, view.state.selection.main.head) });
    return Promise.resolve(null);
  };
  view.dispatch({ effects: lsp.reconfigure(l.client.plugin(uri, 'markdown')) });
}

/** F2 and Shift-F12 ask VS Code, which renames and finds references across the project, not only in this file. */
const ask = (type: 'rename' | 'references') => (view: EditorView) => {
  vscode.postMessage({ type, at: toPos(view.state.doc, view.state.selection.main.head) });
  return true;
};

function create(text: string) {
  return new EditorView({
    doc: text,
    selection: { anchor: bodyStart(text.replaceAll('\r\n', '\n')) }, // CodeMirror counts a CRLF as one character
    parent: document.getElementById('root')!,
    extensions: [
      basicSetup,
      markdown(),
      myst(),
      EditorView.lineWrapping,
      livePreview(),
      pageLook,
      EditorView.theme({ '&.cm-focused': { outline: 'none' } }),
      lsp.of([]),
      Prec.high(keymap.of([{ key: 'F2', run: ask('rename') }, { key: 'Shift-F12', run: ask('references') }])),
      // Send VS Code each of our edits, but not the ones it sent us.
      EditorView.updateListener.of((u) => {
        for (const tr of u.transactions) {
          if (!tr.docChanged || tr.annotation(Transaction.remote)) continue;
          const doc = tr.startState.doc;
          const changes: Change[] = [];
          tr.changes.iterChanges((from, to, _f, _t, inserted) => changes.push({ from: toPos(doc, from), to: toPos(doc, to), insert: inserted.toString() }));
          vscode.postMessage({ type: 'edit', changes });
        }
      }),
    ],
  });
}

let view: EditorView | undefined;
window.addEventListener('message', ({ data: m }: MessageEvent<ToLive>) => {
  if (m.type === 'init') {
    view = create(m.text);
    view.focus();
  } else if (!view) {
    return;
  } else if (m.type === 'changes') {
    // One transaction each: VS Code's changes apply one after another, where a CodeMirror transaction's all refer to the text before it.
    for (const c of m.changes) {
      const doc = view.state.doc;
      view.dispatch({
        changes: { from: toOffset(doc, c.from), to: toOffset(doc, c.to), insert: c.insert },
        annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
      });
    }
  } else if (m.type === 'connect') {
    connect(view, m.root, m.uri);
  } else if (m.type === 'lsp') {
    receive(m.message);
  } else if (m.type === 'built') {
    view.dispatch({ effects: showBuilt.of(m) }); // ignored if `text` no longer matches the editor
  } else if (m.type === 'select') {
    view.dispatch({ selection: { anchor: toOffset(view.state.doc, m.at) }, scrollIntoView: true });
    view.focus();
  }
});
vscode.postMessage({ type: 'ready' });
