import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorSelection, EditorState } from '@codemirror/state';
import { toggleMark } from './format.ts';

test('toggleMark wraps and unwraps, and bold and italic nest', () => {
  // Apply each shortcut in turn to "word", which stays selected.
  let state = EditorState.create({ doc: 'a word', selection: EditorSelection.range(2, 6) });
  const press = (char: string, n: number) => {
    toggleMark(char, n)({ state, dispatch: (tr) => (state = tr.state) });
    return state.doc.toString();
  };
  assert.equal(press('*', 2), 'a **word**');
  assert.equal(press('*', 1), 'a ***word***');
  assert.equal(press('*', 2), 'a *word*');
  assert.equal(press('*', 1), 'a word');
  assert.equal(state.sliceDoc(state.selection.main.from, state.selection.main.to), 'word');
});
