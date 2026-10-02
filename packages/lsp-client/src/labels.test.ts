import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLabel } from './labels.ts';

test('findLabel picks the symbol named by the lowercased label', async () => {
  const at = (name: string, line: number) => ({ name, location: { uri: `file:///p/${name}.md`, range: { start: { line } } } });
  const request = async (method: string, params: unknown) => {
    assert.deepEqual([method, params], ['workspace/symbol', { query: 'My-Fig' }]);
    return [at('my-fig-2', 1), at('my-fig', 4)];
  };
  assert.deepEqual(await findLabel(request, 'My-Fig'), { uri: 'file:///p/my-fig.md', line: 4 });
  assert.equal(await findLabel(async () => null, 'x'), undefined);
});
