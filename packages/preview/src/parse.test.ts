import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromBuiltPage, parseMyst } from './parse.ts';

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

test('a broken reference produces a message instead of throwing', () => {
  const { messages } = parseMyst('See {ref}`nope`.\n');
  assert.ok(messages.length > 0);
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
