import assert from 'node:assert/strict';
import { test } from 'node:test';
import { patterns } from './index.ts';

const matches = (name: keyof typeof patterns, line: string) => [...line.matchAll(patterns[name])].map((m) => m[0]);

test('patterns match MyST syntax', () => {
  assert.deepEqual(matches('role', 'See {numref}`fig-1` and {ref}`intro`.'), ['{numref}`fig-1`', '{ref}`intro`']);
  assert.deepEqual(matches('directive', '```{figure} logo.svg'), ['{figure}']);
  assert.deepEqual(matches('directive', ':::{tab-item} First'), ['{tab-item}']);
  assert.deepEqual(matches('directive', 'text {figure}'), []);
  assert.deepEqual(matches('option', ':label: fig-1'), [':label:']);
  assert.deepEqual(matches('option', ':::{note}'), []);
  assert.deepEqual(matches('label', '(intro)='), ['(intro)=']);
  assert.deepEqual(matches('math', 'cost $5 and $x^2$ or $y$, not $$z$$'), ['$x^2$', '$y$']);
  assert.deepEqual(matches('citation', 'As @smith2020 said; mail a@b.org'), ['@smith2020']);
});
