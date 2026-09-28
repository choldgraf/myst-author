import { mystParse } from 'myst-parser';
import {
  abbreviationPlugin,
  basicTransformationsPlugin,
  enumerateTargetsPlugin,
  footnotesPlugin,
  glossaryPlugin,
  headingDepthPlugin,
  htmlPlugin,
  joinGatesPlugin,
  keysPlugin,
  mathPlugin,
  reconstructHtmlPlugin,
  ReferenceState,
  resolveReferencesPlugin,
} from 'myst-transforms';
import { buttonRole } from 'myst-ext-button';
import { cardDirective } from 'myst-ext-card';
import { exerciseDirectives } from 'myst-ext-exercise';
import { gridDirectives } from 'myst-ext-grid';
import { proofDirective } from 'myst-ext-proof';
import { tabDirectives } from 'myst-ext-tabs';
import type { GenericNode, GenericParent } from 'myst-common';
import { load } from 'js-yaml';
import { unified } from 'unified';
import { EXIT, SKIP, visit } from 'unist-util-visit';
import { VFile } from 'vfile';

/** A top-level rendered node and the source lines (1-based, inclusive) it came from. */
export type Block = { node: GenericNode; start: number; end: number };
export type ParseResult = {
  tree: GenericParent;
  blocks: Block[];
  messages: string[];
  frontmatter: Record<string, any>;
  references?: Record<string, any>; // extra ArticleProvider references from a built page (e.g. cite)
};

// The extensions mystmd enables by default, so the preview matches `myst build`.
const directives = [cardDirective, ...gridDirectives, ...tabDirectives, proofDirective, ...exerciseDirectives];
const roles = [buttonRole];

/** Parse and transform a single MyST page in the browser. */
export function parseMyst(md: string): ParseResult {
  const vfile = new VFile();
  const parse = (s: string) => mystParse(s, { markdownit: { linkify: true }, directives, roles, vfile });
  const tree = parse(md) as GenericParent;

  let frontmatter: Record<string, any> = {};
  const first = tree.children[0];
  if (first?.type === 'code' && first.lang === 'yaml' && md.startsWith('---')) {
    tree.children.shift();
    try {
      frontmatter = (load(first.value) as object) ?? {};
    } catch {} // half-typed YAML is normal while editing
  }

  // Directive transforms replace the directive node with children that have no position; keep the directive's lines.
  visit(tree, 'mystDirective', (d: GenericNode) => d.children?.forEach((c) => (c.position ??= d.position)));

  const state = new ReferenceState('', { vfile });
  unified()
    .use(reconstructHtmlPlugin)
    .use(htmlPlugin)
    .use(basicTransformationsPlugin, { parser: parse })
    // Like mystmd: the page title is the h1, so content headings start at h2.
    .use(headingDepthPlugin, { firstDepth: frontmatter.content_includes_title ? 1 : 2 })
    .use(mathPlugin, { macros: {} })
    .use(glossaryPlugin)
    .use(abbreviationPlugin, { abbreviations: {} })
    .use(enumerateTargetsPlugin, { state })
    .use(footnotesPlugin)
    .use(joinGatesPlugin)
    .use(resolveReferencesPlugin, { state })
    .use(keysPlugin)
    .runSync(tree as any, vfile);

  return { tree, blocks: toBlocks(tree), messages: vfile.messages.map((m) => m.message), frontmatter };
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
