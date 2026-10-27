import type { GenericNode, GenericParent } from 'myst-common';
import type { BuiltPage } from 'mystmd-client/content-server';
import * as mystmd from 'mystmd-client/parse';
import { EXIT, SKIP, visit } from 'unist-util-visit';

/** A top-level rendered node and the source lines (1-based, inclusive) it came from. */
export type Block = { node: GenericNode; start: number; end: number };
export type ParseResult = {
  tree: GenericParent;
  blocks: Block[];
  frontmatter: Record<string, any>;
  references?: Record<string, any>; // extra ArticleProvider references from a built page (e.g. cite)
};

/** Parse and transform a single MyST page in the browser. */
export function parseMyst(md: string): ParseResult {
  const { tree, frontmatter } = mystmd.parseMyst(md);

  // mystmd resolves embeds and references to other pages from the whole project, so here we can only say they're coming.
  markUnresolved(tree, false);
  // Only mystmd runs code: inline expressions wait for its build (see `withBuiltBlocks`).
  visit(tree, 'inlineExpression', (n: GenericNode) => void (n.pending = true));

  return { tree, blocks: toBlocks(tree), frontmatter };
}

/**
 * Show embeds and references that mystmd left unresolved, instead of leaving them blank.
 * Embeds are `![](#label)` and `{embed}`. References are `[](#label)`, `@label`, `{ref}`, and the like.
 * They're grey while the fast preview waits for a build, and red in a built page, where they're broken.
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
    // An empty link to a page, `[](other.md)`, gets its title from the build, so until then show where it points.
    // `@label` is a citation until mystmd finds the label or the bibliography entry, and has an `error` if it finds neither.
    const ref = n.type === 'crossReference' && !n.resolved ? `#${n.label}`
      : n.type === 'link' && (n.url?.startsWith('#') || !n.children?.length) ? n.url
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

function toBlocks(tree: GenericParent): Block[] {
  // A code cell is a block whose code and outputs have no position, so they take the block's.
  const nodes = tree.children.flatMap((c) => (c.type === 'block' ? (c.children ?? []) : [c]).map((node) => ({ node, outer: c.position })));
  let last = 1;
  return nodes.map(({ node, outer }) => {
    const pos = node.position ?? firstPosition(node) ?? outer;
    const start = pos?.start.line ?? last;
    const end = pos?.end.line ?? start;
    last = end;
    return { node, start, end };
  });
}

/**
 * A built page's blocks, with the source lines of the fast parse's blocks.
 * Built pages lose the lines of directive output, and embedded content keeps the lines of the page it came from.
 * Both parses usually find the same top-level blocks, so they pair up in order.
 * When the counts differ, this returns null.
 */
export function withSourceLines(built: ParseResult, fast: ParseResult): ParseResult | null {
  if (built.blocks.length !== fast.blocks.length) return null;
  return { ...built, blocks: built.blocks.map((b, i) => ({ ...b, start: fast.blocks[i].start, end: fast.blocks[i].end })) };
}

/** mystmd's build of `text`, with the fast parse's lines (see `withSourceLines`). */
export function builtWithLines(page: BuiltPage, text: string) {
  return withSourceLines(fromBuiltPage(page), parseMyst(text));
}

/**
 * Whether the page renders its title above the content.
 * The title is the frontmatter's, or else the first heading.
 * That heading stays in the content, and `content_includes_title` is set, unless it's a leading `# Title`.
 */
export const hasTitle = (frontmatter: Record<string, any>) => !!frontmatter.title && !frontmatter.content_includes_title;

/**
 * The labels you can reference in a block, as `#a #b`, which the preview's CSS shows above it.
 * Targets have an `html_id`, but so do references to them, which take their target's.
 * A heading's automatic label is `implicit`.
 */
export function labels(node: GenericNode) {
  const found = new Set<string>(); // a subfigure's caption number repeats its label
  visit(node, (n: GenericNode) => void (n.html_id && !n.implicit && n.type !== 'crossReference' && found.add(`#${n.label}`)));
  return [...found].join(' ') || undefined;
}

/** A range of source lines (1-based, inclusive) that the live editor in `./live` renders and reveals as one unit, and the blocks in it. */
export type Span = { start: number; end: number; blocks: Block[] };

// Label characters follow mystmd's TARGET_PATTERN (markdown-it-myst).
const LABEL = /^\s*\([a-zA-Z0-9|@<>*./_\-+:]+\)=\s*$/;

/**
 * Group a page's blocks into spans for the live editor, given the page's source lines.
 * Blocks that share lines merge, and label lines (`(x)=`) join the block below them.
 * When the page has a title (`hasTitle`) or frontmatter, the lines above the first block become a span with no blocks.
 * Those lines hold the frontmatter and any `# Title` that mystmd lifted out, and the live editor shows the page title and properties in their place.
 */
export function spans({ blocks, frontmatter }: ParseResult, lines: string[]): Span[] {
  const out: Span[] = [];
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
  let titleEnd = (out[0]?.start ?? lines.length + 1) - 1;
  while (titleEnd > 0 && !lines[titleEnd - 1].trim()) titleEnd--;
  // Frontmatter opens with a `---` line and closes with another before the first block.
  const front = lines[0]?.trim() === '---' && lines.slice(1, titleEnd).some((l) => l.trim() === '---');
  if ((hasTitle(frontmatter) || front) && titleEnd > 0) out.unshift({ start: 1, end: titleEnd, blocks: [] });
  return out;
}

/**
 * Return `fast` (the fast parse of `text`) with the nodes of `built` for each span whose source is the same as in `builtText`.
 * `builtText` is the text that `built` was built from.
 * `built` needs the fast parse's lines (see `withSourceLines`). Editing a span then only renders that span from the fast parse until the next build.
 * Unchanged spans keep the build's numbering and references, even when an edit elsewhere changes them, until the next build.
 * Edited spans keep the build's result for each inline expression it ran, and an edited code cell keeps the build's outputs, dimmed.
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
  const results = new Map<string | undefined, GenericNode>();
  visit(built.tree, 'inlineExpression', (n: GenericNode) => void (results.has(n.value) || results.set(n.value, n)));
  visit(fast.tree, 'inlineExpression', (n: GenericNode) => {
    const r = results.get(n.value);
    if (r) Object.assign(n, { pending: false, result: r.result, children: r.children });
  });
  // Code cells pair up in order, unless one was added or removed.
  const outputs = (blocks: Block[]) => blocks.filter((b) => b.node.type === 'outputs').map((b) => b.node);
  const [fastOutputs, builtOutputs] = [outputs(fast.blocks), outputs(built.blocks)];
  const stale = (node: GenericNode) => fastOutputs.length === builtOutputs.length && node.type === 'outputs'
    ? { type: 'div', key: node.key, style: { opacity: 0.5 }, children: [builtOutputs[fastOutputs.indexOf(node)]] }
    : node;
  return { ...fast, references: built.references, blocks: fast.blocks.map((b) => ({ ...b, node: nodes.get(b) ?? stale(b.node) })) };
}

// Built pages drop positions on directive output (admonition, figure, tabs…), but their content keeps them.
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

/**
 * A notebook's build split into one page per cell: mystmd builds each cell as one block.
 * A notebook has no hash to compare with, so a cell gets its page only while its text in `sources` matches `saved`, which is what mystmd built.
 * Otherwise the cell gets null, as do all cells if the build has a different number of cells.
 * Only the first cell keeps the page title, which mystmd takes from the notebook's first heading.
 */
export function cellPages(page: BuiltPage, sources: string[], saved: string[]): (BuiltPage | null)[] {
  const blocks = page.mdast.children;
  return sources.map((source, i) => blocks.length !== sources.length || source !== saved[i] ? null : {
    ...page,
    frontmatter: i ? { ...page.frontmatter, title: undefined } : page.frontmatter,
    mdast: { type: 'root', children: blocks[i].children ?? [] },
  });
}

/** Render a page built by mystmd the same way as the fast in-browser parse. Works on a copy, since hosts render the same page elsewhere. */
export function fromBuiltPage(page: BuiltPage): ParseResult {
  const tree = structuredClone(page.mdast);
  // mystmd leaves embeds and references it can't find blank.
  markUnresolved(tree, true);
  return {
    tree,
    blocks: toBlocks(tree),
    frontmatter: page.frontmatter ?? {},
    references: page.references,
  };
}
