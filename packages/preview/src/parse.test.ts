import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromBuiltPage, parseMyst, spans, withBuiltBlocks, withSourceLines } from './parse.ts';

const md = [
  '---', 'title: Hi', '---',          // 1-3
  '# Intro',                          // 4
  '(sec)=',                           // 5
  'See {numref}`fig-a`.',             // 6
  '',
  '```{figure} a.png',                // 8
  ':label: fig-a',
  'Cap',
  '```',                              // 11
  '',
  '$$x$$ (eq1)',                      // 13
  '',
].join('\n');

test('top-level blocks keep their source line ranges', () => {
  const { blocks, messages, frontmatter } = parseMyst(md);
  assert.equal(frontmatter.title, 'Hi');
  assert.deepEqual(
    blocks.map((b) => [b.node.type, b.start, b.end]),
    [['heading', 4, 4], ['paragraph', 6, 6], ['container', 8, 11], ['math', 13, 13]],
  );
  assert.deepEqual(messages, []);
});

test('spans: the titled frontmatter, and each block with the label lines above it', () => {
  const result = parseMyst(md);
  assert.deepEqual(
    spans(result, md.split('\n')).map((s) => [s.start, s.end, s.blocks.map((b) => b.node.type)]),
    [[1, 3, []], [4, 4, ['heading']], [5, 6, ['paragraph']], [8, 11, ['container']], [13, 13, ['math']]],
  );
});

test('spans: a list leaves the blank line after it out, so it stays as spacing', () => {
  const list = '- a\n- b\n\nAfter';
  assert.deepEqual(spans(parseMyst(list), list.split('\n')).map((s) => [s.start, s.end]), [[1, 2], [4, 4]]);
});

test('withSourceLines: built blocks take the lines of the fast parse, or null if the blocks differ', () => {
  const fast = parseMyst(md);
  const built = { ...fast, blocks: fast.blocks.map((b) => ({ ...b, start: 1, end: 1 })) };
  assert.deepEqual(withSourceLines(built, fast)!.blocks.map((b) => [b.start, b.end]), fast.blocks.map((b) => [b.start, b.end]));
  assert.equal(withSourceLines({ ...built, blocks: built.blocks.slice(1) }, fast), null);
});

test('withBuiltBlocks: unchanged spans keep the built nodes, at their new lines; edited and new ones get the fast parse', () => {
  const fast = parseMyst(md);
  const built = { ...fast, blocks: fast.blocks.map((b) => ({ ...b, node: { type: 'built' } })) };
  const text = md.replace('See {numref}', 'Now see {numref}').replace('```\n\n', '```\n\nNew.\n\n');
  const { blocks } = withBuiltBlocks(parseMyst(text), text, built, md);
  assert.deepEqual(blocks.map((b) => [b.node.type, b.start]), [['built', 4], ['paragraph', 6], ['built', 8], ['paragraph', 13], ['built', 15]]);
});

test('@label resolves to a label on the page, like [](#label)', () => {
  const para = parseMyst('```{figure} a.png\n:label: fig-a\nCap\n```\n\nSee @fig-a and [](#fig-a).\n').blocks[1].node;
  const text = (n: any): string => n.value ?? (n.children ?? []).map(text).join('');
  const refs = para.children!.filter((c: any) => c.type !== 'text');
  // mystmd puts a non-breaking space before the number.
  assert.deepEqual(refs.map((c: any) => [c.type, text(c)]), [['crossReference', 'Figure\u00a01'], ['crossReference', 'Figure\u00a01']]);
});

test('a broken reference produces a message instead of throwing', () => {
  const { messages } = parseMyst('See {ref}`nope`.\n');
  assert.ok(messages.length > 0);
});

test('embeds show a placeholder until mystmd builds them', () => {
  const { blocks } = parseMyst('![](#a)\n\n```{embed} #b\n```\n');
  assert.deepEqual(blocks.map((b) => [b.node.type, b.node.children![0].value]), [
    ['span', '#a is embedded after mystmd builds'],
    ['span', '#b is embedded after mystmd builds'],
  ]);
});

test('a built page marks embeds that mystmd could not resolve', () => {
  const embed = { type: 'embed', key: 'e', source: { label: 'nope' } };
  const { blocks } = fromBuiltPage({ sha256: '', location: '/index.md', mdast: { type: 'root', children: [embed] } } as any);
  assert.equal(blocks[0].node.children![0].value, "Broken embed: mystmd couldn't find #nope");
});

test('references to other pages show their label until mystmd builds them', () => {
  const { blocks } = parseMyst('See [](#a), {ref}`b` and @c.\n');
  const refs = blocks[0].node.children!.filter((c: any) => c.type === 'span');
  assert.deepEqual(refs.map((c: any) => c.children[0].value), ['#a', '#b', '@c']);
});

test('a built page marks references that mystmd could not resolve', () => {
  const para = { type: 'paragraph', children: [
    { type: 'link', url: '#a', children: [] },
    { type: 'crossReference', label: 'b', key: 'b' },
    { type: 'cite', label: 'c', error: 'not found' },
    { type: 'crossReference', label: 'ok', resolved: true, children: [{ type: 'text', value: 'OK' }] },
  ] };
  const { blocks } = fromBuiltPage({ sha256: '', location: '/index.md', mdast: { type: 'root', children: [para] } } as any);
  assert.deepEqual(blocks[0].node.children!.map((c: any) => [c.type, c.children[0].value]), [['span', '⚠ #a'], ['span', '⚠ #b'], ['span', '⚠ @c'], ['crossReference', 'OK']]);
});

test('a built page keeps its line ranges, using content positions for directive output', () => {
  const pos = (a: number, b: number) => ({ start: { line: a, column: 1 }, end: { line: b, column: 1 } });
  const text = (l: number) => ({ type: 'paragraph', position: pos(l, l), children: [{ type: 'text', value: 'x' }] });
  const page = {
    sha256: '',
    location: '/index.md',
    frontmatter: { title: 'Hi' },
    mdast: { type: 'root', children: [{ type: 'block', children: [
      { type: 'heading', depth: 1, position: pos(4, 4), children: [] },
      { type: 'admonition', children: [text(7)] },
    ] }] },
  };
  const { blocks, frontmatter } = fromBuiltPage(page as any);
  assert.deepEqual(blocks.map((b) => [b.node.type, b.start, b.end]), [['heading', 4, 4], ['admonition', 7, 7]]);
  assert.equal(frontmatter.title, 'Hi');
});
