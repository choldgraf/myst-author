import type { GenericNode, GenericParent } from 'myst-common';
import type { BuiltPage } from '@myst-author/mystmd/built';
import * as mystmd from '@myst-author/mystmd/parse';
import { EXIT, SKIP, visit } from 'unist-util-visit';

/** A top-level rendered node and the source lines (1-based, inclusive) it came from. */
export type Block = { node: GenericNode; start: number; end: number };
export type ParseResult = {
  tree: GenericParent;
  blocks: Block[];
  messages: string[];
  frontmatter: Record<string, any>;
  references?: Record<string, any>; // extra ArticleProvider references from a built page (e.g. cite)
};

/** Parse and transform a single MyST page in the browser. */
export function parseMyst(md: string): ParseResult {
  const { tree, messages, frontmatter } = mystmd.parseMyst(md);

  // mystmd resolves embeds and references to other pages from the whole project, so here we can only say they're coming.
  markUnresolved(tree, false);

  return { tree, blocks: toBlocks(tree), messages, frontmatter };
}

/**
 * Make embeds (`![](#label)`, `{embed}`) and references (`[](#label)`, `@label`, `{ref}`…) that mystmd left unresolved visible, instead of blank:
 * grey while the fast preview waits for a build, red in a built page, where they're broken.
 */
function markUnresolved(tree: GenericParent, built: boolean) {
  const color = built ? '#dc2626' : '#888';
  const text = (n: GenericNode, value: string) => [{ type: 'text', key: `${n.key}-text`, value }];
  visit(tree, (n: GenericNode) => {
    const embed = n.type === 'image' && n.url?.startsWith('#') ? n.url.slice(1)
      : n.type === 'embed' && !n.children?.length ? n.source?.label
      : undefined;
    if (embed !== undefined) {
      Object.assign(n, {
        type: 'span', // not a div: `![](#label)` can sit inside a paragraph
        style: { display: 'block', padding: '0.5rem', border: `1px dashed ${color}`, color, fontSize: '0.875rem' },
        children: text(n, built ? `Broken embed: mystmd couldn't find #${embed}` : `#${embed} is embedded after mystmd builds`),
      });
      return SKIP;
    }
    // A resolved `[](#label)` becomes a crossReference, so a `#` link is one mystmd couldn't find.
    // `@label` is a citation until mystmd finds the label or the bibliography entry, and has an `error` if it finds neither.
    const ref = n.type === 'crossReference' && !n.resolved ? `#${n.label}`
      : n.type === 'link' && n.url?.startsWith('#') ? n.url
      : n.type === 'cite' && (n.error || !built) ? `@${n.label}`
      : undefined;
    // The fast preview only knows this page's labels, so only fill in references that would otherwise be blank.
    if (ref === undefined || (!built && n.children?.length)) return;
    Object.assign(n, {
      type: 'span',
      style: { color },
      children: !built ? text(n, ref)
        : n.children?.length ? [...text(n, '⚠ '), ...n.children]
        : text(n, `⚠ ${ref}`),
    });
    return SKIP;
  });
}

export function toBlocks(tree: GenericParent): Block[] {
  const nodes = tree.children.flatMap((c) => (c.type === 'block' ? (c.children ?? []) : [c]));
  let last = 1;
  return nodes.map((node) => {
    const pos = node.position ?? firstPosition(node);
    const start = pos?.start.line ?? last;
    const end = pos?.end.line ?? start;
    last = end;
    return { node, start, end };
  });
}

/**
 * A built page's blocks, with the source lines of the fast parse's blocks.
 * Built pages lose the lines of directive output, and embedded content keeps the lines of the page it came from.
 * Both parses find the same top-level blocks, so they pair up in order; when the counts differ, returns null.
 */
export function withSourceLines(built: ParseResult, fast: ParseResult): ParseResult | null {
  if (built.blocks.length !== fast.blocks.length) return null;
  return { ...built, blocks: built.blocks.map((b, i) => ({ ...b, start: fast.blocks[i].start, end: fast.blocks[i].end })) };
}

/** Source lines (1-based, inclusive) that the live editor (`./live`) renders and reveals as one unit, and the blocks from them. */
export type Span = { start: number; end: number; blocks: Block[] };

const LABEL = /^\([^)\s]+\)=\s*$/;

/**
 * Group a page's blocks into spans for the live editor, given the page's source lines.
 * Blocks that share lines merge, and label lines (`(x)=`) join the block below them.
 * Frontmatter with a title is a span with no blocks: it renders as the page title.
 */
export function spans({ blocks, frontmatter }: ParseResult, lines: string[]): Span[] {
  const out: Span[] = [];
  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (close > 0 && frontmatter.title) out.push({ start: 1, end: close + 1, blocks: [] });
  for (const b of blocks) {
    const last = out.at(-1);
    let start = b.start;
    while (start - 1 > (last?.end ?? 0) && LABEL.test(lines[start - 2])) start--;
    let end = b.end;
    while (end > start && !lines[end - 1]?.trim()) end--; // markdown-it ends a list after its trailing blank line
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
      last.blocks.push(b);
    } else out.push({ start, end, blocks: [b] });
  }
  return out;
}

/**
 * `fast`, the fast parse of `text`, with the nodes of `built` wherever a span's source is the same as in `builtText`, the text `built` was built from.
 * `built` needs the fast parse's lines (see `withSourceLines`). Editing a span then only renders that span from the fast parse until the next build.
 * ponytail: unchanged spans keep the build's numbering and references, even when an edit elsewhere changes them, until the next build.
 */
export function withBuiltBlocks(fast: ParseResult, text: string, built: ParseResult, builtText: string): ParseResult {
  const source = (s: Span, lines: string[]) => lines.slice(s.start - 1, s.end).join('\n');
  const builtLines = builtText.split('\n');
  const kept = Map.groupBy(spans(built, builtLines), (s) => source(s, builtLines));
  const lines = text.split('\n');
  const nodes = new Map<Block, GenericNode>();
  for (const s of spans(fast, lines)) {
    const match = kept.get(source(s, lines))?.shift();
    if (match?.blocks.length === s.blocks.length) s.blocks.forEach((b, i) => nodes.set(b, match.blocks[i].node));
  }
  return { ...fast, references: built.references, blocks: fast.blocks.map((b) => ({ ...b, node: nodes.get(b) ?? b.node })) };
}

// Built pages drop positions on directive output (admonition, figure, tabs…); their content keeps them.
// Included content carries the other file's lines, so don't look inside it.
function firstPosition(node: GenericNode) {
  let pos: GenericNode['position'];
  visit(node, (n: GenericNode) => {
    if (n.type === 'include') return SKIP;
    if (!n.position) return;
    pos = n.position;
    return EXIT;
  });
  return pos;
}

/** Render a page built by mystmd the same way as the fast in-browser parse. */
export function fromBuiltPage(page: BuiltPage): ParseResult {
  // mystmd leaves embeds and references it can't find blank.
  markUnresolved(page.mdast, true);
  return {
    tree: page.mdast,
    blocks: toBlocks(page.mdast),
    messages: [],
    frontmatter: page.frontmatter ?? {},
    references: page.references,
  };
}
