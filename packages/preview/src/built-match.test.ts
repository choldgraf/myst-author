import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { sha256, type BuiltPage } from 'mystmd-client/content-server';
import { offerBuilt, showBuilt } from './built-match.ts';

test('offerBuilt shows a build only when it matches the editor text, with either line ending', async () => {
  const text = '# Title\n\nSome text.\n';
  const offer = async (hashed: string) => {
    const sent: TransactionSpec[] = [];
    const page = { sha256: await sha256(hashed) } as BuiltPage;
    await offerBuilt({ state: EditorState.create({ doc: text }), dispatch: (tr: TransactionSpec) => sent.push(tr) }, page);
    return sent.flatMap((tr) => [tr.effects ?? []].flat()).filter((e) => e.is(showBuilt)).length;
  };
  assert.equal(await offer(text), 1);
  assert.equal(await offer(text.replaceAll('\n', '\r\n')), 1);
  assert.equal(await offer('# Title\n\nOlder text.\n'), 0);
});
