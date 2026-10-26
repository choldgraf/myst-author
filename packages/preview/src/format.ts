import { startCompletion } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { EditorSelection, type EditorState, type StateCommand } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';

// How many `char`s wrap the text from `from` to `to`, up to 3.
function wrapping(state: EditorState, from: number, to: number, char: string) {
  let before = 0;
  let after = 0;
  while (before < 3 && from - before > 0 && state.sliceDoc(from - before - 1, from - before) === char) before++;
  while (after < 3 && state.sliceDoc(to + after, to + after + 1) === char) after++;
  return Math.min(before, after);
}

/**
 * Wrap each selection in `n` copies of `char`, or unwrap it if it's already wrapped.
 * An empty selection gets an empty pair with the cursor inside.
 */
export const toggleMark = (char: string, n: number): StateCommand => ({ state, dispatch }) => {
  dispatch(state.update(state.changeByRange((r) => {
    // One `*` is italic, two is bold, and three is both, so the bit for `n` says whether this mark is on.
    if (wrapping(state, r.from, r.to, char) & n) return { changes: [{ from: r.from - n, to: r.from }, { from: r.to, to: r.to + n }], range: EditorSelection.range(r.from - n, r.to - n) };
    const mark = char.repeat(n);
    return { changes: [{ from: r.from, insert: mark }, { from: r.to, insert: mark }], range: EditorSelection.range(r.from + n, r.to + n) };
  }), { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

/**
 * Turn each selection into `[selection]()`, with the cursor in the parentheses and completion open.
 * mystmd-lsp completes files there, and labels after a `#`.
 * With no selection, the cursor goes in the brackets for the link text.
 */
function link(view: EditorView) {
  const empty = view.state.selection.main.empty;
  view.dispatch(view.state.changeByRange((r) => ({
    changes: [{ from: r.from, insert: '[' }, { from: r.to, insert: ']()' }],
    range: EditorSelection.cursor(r.empty ? r.from + 1 : r.to + 3),
  })), { scrollIntoView: true, userEvent: 'input' });
  if (!empty) startCompletion(view);
  return true;
}

/**
 * The formatting shortcuts most editors share. Mod is Cmd on a Mac and Ctrl elsewhere.
 * They stop the key event, or VS Code's webview would also pass it on to VS Code, where Cmd+B hides the sidebar.
 */
export const formatKeymap = keymap.of([
  { key: 'Mod-b', run: toggleMark('*', 2) },
  { key: 'Mod-i', run: toggleMark('*', 1) },
  { key: 'Mod-e', run: toggleMark('`', 1) },
  { key: 'Mod-k', run: link },
  indentWithTab, // CodeMirror leaves Tab to move focus unless asked
].map((b) => ({ ...b, stopPropagation: true })));
