import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visit } from 'unist-util-visit';
import { cellPages, fromBuiltPage, parseMyst, spans, withBuiltBlocks, withSourceLines } from './parse.ts';

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
  const { blocks, frontmatter } = parseMyst(md);
  assert.equal(frontmatter.title, 'Hi');
  assert.deepEqual(
    blocks.map((b) => [b.node.type, b.start, b.end]),
    [['heading', 4, 4], ['paragraph', 6, 6], ['container', 8, 11], ['math', 13, 13]],
  );
});

test('spans: the titled frontmatter, and each block with the label lines above it', () => {
  const result = parseMyst(md);
  assert.deepEqual(
    spans(result, md.split('\n')).map((s) => [s.start, s.end, s.blocks.map((b) => b.node.type)]),
    [[1, 3, []], [4, 4, ['heading']], [5, 6, ['paragraph']], [8, 11, ['container']], [13, 13, ['math']]],
  );
});

test('a code cell keeps its lines', () => {
  const src = '---\ntitle: Hi\n---\n\n```{code-cell} python\nx\n```';
  assert.deepEqual(spans(parseMyst(src), src.split('\n')).map((s) => [s.start, s.end, s.blocks.map((b) => b.node.type)]), [[1, 3, []], [5, 7, ['code', 'outputs']]]);
});

test('a leading `# Title` is the page title, as in mystmd, so the fast parse has the same blocks as the build', () => {
  const src = '# Hi\n\nText';
  const result = parseMyst(src);
  assert.equal(result.frontmatter.title, 'Hi');
  assert.deepEqual(spans(result, src.split('\n')).map((s) => [s.start, s.end, s.blocks.map((b) => b.node.type)]), [[1, 1, []], [3, 3, ['paragraph']]]);
});

test('spans: a list leaves the blank line after it out, so it stays as spacing', () => {
  const list = '- a\n- b\n\nAfter';
  assert.deepEqual(spans(parseMyst(list), list.split('\n')).map((s) => [s.start, s.end]), [[1, 2], [4, 4]]);
});

test('spans: label lines take the characters mystmd accepts', () => {
  const src = '  (fig.1|a)=\nText';
  assert.deepEqual(spans(parseMyst(src), src.split('\n')).map((s) => [s.start, s.end]), [[1, 2]]);
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

test('withBuiltBlocks: edited spans keep the build\'s inline expression results, and an edited code cell keeps its outputs, dimmed', () => {
  const src = '```{code-cell} python\nx = 1\n```\n\nIs {eval}`x`.';
  const built = parseMyst(src);
  visit(built.tree, 'inlineExpression', (n: any) => void Object.assign(n, { pending: false, result: { status: 'ok' }, children: [{ type: 'text', value: '1' }] }));
  const outputs = built.blocks.find((b) => b.node.type === 'outputs')!.node;
  const text = src.replace('x = 1', 'x = 2').replace('Is', 'It is') + ' And {eval}`y`.';
  const result = withBuiltBlocks(parseMyst(text), text, built, src);
  assert.deepEqual(result.blocks[1].node, { type: 'div', key: result.blocks[1].node.key, style: { opacity: 0.5 }, children: [outputs] });
  const expressions: any[] = [];
  visit(result.tree, 'inlineExpression', (n: any) => void expressions.push(n));
  assert.deepEqual(expressions.map((n) => [n.value, n.pending, n.children?.[0]?.value]), [['x', false, '1'], ['y', true, undefined]]);
});

test('cellPages: a cell gets its block while its text is as saved, and only the first cell keeps the title', () => {
  const cell = (value: string) => ({ type: 'block', children: [{ type: 'text', value }] });
  const page = { sha256: '', location: '/nb.ipynb', frontmatter: { title: 'Nb' }, mdast: { type: 'root', children: [cell('a'), cell('b')] } } as any;
  const [first, second] = cellPages(page, ['a', 'b'], ['a', 'b']);
  assert.deepEqual([first!.mdast.children[0].value, second!.mdast.children[0].value], ['a', 'b']);
  assert.deepEqual([first!.frontmatter!.title, second!.frontmatter!.title], ['Nb', undefined]);
  assert.equal(cellPages(page, ['a', 'b edited'], ['a', 'b'])[1], null);
  assert.deepEqual(cellPages(page, ['a', 'b', 'new'], ['a', 'b']), [null, null, null]); // the build has a different number of cells
});

test('@label resolves to a label on the page, like [](#label)', () => {
  const para = parseMyst('```{figure} a.png\n:label: fig-a\nCap\n```\n\nSee @fig-a and [](#fig-a).\n').blocks[1].node;
  const text = (n: any): string => n.value ?? (n.children ?? []).map(text).join('');
  const refs = para.children!.filter((c: any) => c.type !== 'text');
  // mystmd puts a non-breaking space before the number.
  assert.deepEqual(refs.map((c: any) => [c.type, text(c)]), [['crossReference', 'Figure\u00a01'], ['crossReference', 'Figure\u00a01']]);
});

test('a broken reference doesn\'t throw', () => {
  assert.doesNotThrow(() => parseMyst('See {ref}`nope`.\n'));
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
