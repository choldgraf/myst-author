import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimalChange } from './change.ts';

test('minimalChange replaces only what differs', () => {
  assert.deepEqual(minimalChange('a b c', 'a X c'), { from: 2, to: 3, insert: 'X' });
  assert.deepEqual(minimalChange('aa', 'aaa'), { from: 2, to: 2, insert: 'a' });
  assert.deepEqual(minimalChange('same', 'same'), { from: 4, to: 4, insert: '' });
});
