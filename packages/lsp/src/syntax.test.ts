import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameAt, optionAt, refAt, refsInText } from './syntax.ts';

const at = (line: string) => refAt(line.replace('|', ''), line.indexOf('|'));

test('refAt recognizes each trigger', () => {
  assert.deepEqual(at('See {numref}`fig-|x` here'), { trigger: 'numref', prefix: 'fig-', start: 13, end: 18 });
  assert.equal(at('{ref}`Title <sec|`')?.prefix, 'sec');
  assert.equal(at('{eq}`|')?.trigger, 'eq');
  assert.equal(at('{doc}`../ch|')?.trigger, 'doc');
  assert.deepEqual(at('see [](#fi|)'), { trigger: 'link-hash', prefix: 'fi', start: 8, end: 10 });
  assert.equal(at('<#fig|>')?.trigger, 'link-hash');
  assert.equal(at('[text](../chap|')?.trigger, 'link-path');
  assert.deepEqual(at('```{fig|'), { trigger: 'directive', prefix: 'fig', start: 4, end: 7 });
  assert.equal(at(':::{no|')?.trigger, 'directive');
  assert.equal(at('text {ab|')?.trigger, 'role');
  assert.equal(at('plain text|'), null);
});

test('refsInText skips code but not directive bodies', () => {
  const text = [
    'Use ``{ref}`a` `` or `[](#b)` in text, but {ref}`c` counts.', // inline code masked, role kept
    '```python', '{ref}`d`', '```',                              // plain code fence
    '```{code-block} md', '[](#e)', '```',                        // code directive
    '````{note}', '{ref}`f`', '```', '{ref}`g`', '```', '{ref}`h`', '````', // nested plain fence inside a note
    '::::{tab-set}', ':::{code-block} md', '{ref}`i`', ':::', ':::{tab-item} T', '{ref}`j`', ':::', '::::', // colon fences
  ].join('\n');
  assert.deepEqual(refsInText(text).map((r) => r.target), ['c', 'f', 'h', 'j']);
});

test('refsInText finds references with target and end ranges', () => {
  const refs = refsInText('See {ref}`intro`, [](#fig-sine),\nand {numref}`Fig <fig-sine>` and <#eq1>.');
  assert.deepEqual(
    refs.map((r) => [r.kind, r.target, r.line, r.start, r.end, r.after]),
    [
      ['ref', 'intro', 0, 10, 15, 16],
      ['link', 'fig-sine', 0, 22, 30, 31],
      ['numref', 'fig-sine', 1, 18, 26, 28],
      ['link', 'eq1', 1, 35, 38, 39],
    ],
  );
});

test('xref links: completion contexts and references', () => {
  assert.deepEqual(at('see [](xref:py|)'), { trigger: 'xref-key', prefix: 'py', start: 12, end: 14 });
  assert.deepEqual(at('<xref:spec/tables#ex|>'), { trigger: 'xref-target', prefix: 'ex', start: 18, end: 20, key: 'spec/tables' });
  assert.equal(at('[](xref:python#library/a|)')?.prefix, 'library/a');
  const refs = refsInText('[](xref:python#library/abc) [ABCs](xref:spec) <xref:spec/tables#example>');
  assert.deepEqual(
    refs.map((r) => [r.kind, r.target, r.start, r.end, r.text]),
    [
      ['xref', 'python#library/abc', 8, 26, ''],
      ['xref', 'spec', 40, 44, 'ABCs'],
      ['xref', 'spec/tables#example', 52, 71, undefined],
    ],
  );
});

test('optionAt finds the enclosing directive and options already used', () => {
  const lines = ['```{figure} a.png', ':label: fig', ':wi', '```'];
  assert.deepEqual(optionAt(lines, 2, 3), { directive: 'figure', used: ['label'], prefix: 'wi', start: 1, end: 3 });
  assert.equal(optionAt([':::{note}', 'body', ':x'], 2, 2), null); // options must come right after the fence
  assert.equal(optionAt(['plain', ':'], 1, 1), null);
});

test('citations: `@key` and `{cite}` keys, but not emails or URLs', () => {
  assert.equal(at('see [@smi|]')?.trigger, 'at');
  assert.deepEqual(at('{cite:p}`a, b|`'), { trigger: 'cite', prefix: 'b', start: 12, end: 13 });
  const refs = refsInText('See @fig-a. [@doe2020, p. 3; -@roe] {cite:t}`a, b` a@b.com https://x.com/@me');
  assert.deepEqual(refs.map((r) => [r.kind, r.target, r.start]), [['cite', 'fig-a', 5], ['cite', 'doe2020', 14], ['cite', 'roe', 31], ['cite', 'a', 45], ['cite', 'b', 48]]);
});

test('directive file arguments, and names to hover', () => {
  assert.equal(at('```{figure} img/pl|')?.trigger, 'path');
  const text = '```{figure} img/a b.png\n```\n:::{include} /x.md\n:::\n```{image} https://x.org/a.png\n```\n```{figure} #cell\n```\n```md\n```{image} c.png\n```\n```';
  assert.deepEqual(refsInText(text).map((r) => [r.kind, r.target, r.line, r.start, r.end]), [['path', 'img/a b.png', 0, 12, 23], ['path', '/x.md', 2, 13, 18]]);
  const lines = ['```{figure} a.png', ':width: 50%', 'See {numref}`x`', '```'];
  assert.deepEqual(nameAt(lines, 0, 5), { kind: 'directive', name: 'figure' });
  assert.deepEqual(nameAt(lines, 1, 3), { kind: 'option', name: 'width', directive: 'figure' });
  assert.deepEqual(nameAt(lines, 2, 6), { kind: 'role', name: 'numref' });
  assert.equal(nameAt(lines, 2, 14), undefined);
});
