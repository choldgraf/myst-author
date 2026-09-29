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
import { defaultDirectives } from 'myst-directives';
import { defaultRoles } from 'myst-roles';
import { buttonRole } from 'myst-ext-button';
import { cardDirective } from 'myst-ext-card';
import { exerciseDirectives } from 'myst-ext-exercise';
import { gridDirectives } from 'myst-ext-grid';
import { proofDirective } from 'myst-ext-proof';
import { tabDirectives } from 'myst-ext-tabs';
import type { GenericNode, GenericParent } from 'myst-common';
import { load } from 'js-yaml';
import type { BuiltPage } from './built.ts';
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
const extDirectives = [cardDirective, ...gridDirectives, ...tabDirectives, proofDirective, ...exerciseDirectives];
const extRoles = [buttonRole];
/** Every directive and role the parser knows: myst-parser's defaults plus the extensions. */
export const directives = [...defaultDirectives, ...extDirectives];
export const roles = [...defaultRoles, ...extRoles];

/** Parse and transform a single MyST page in the browser. */
export function parseMyst(md: string): ParseResult {
  const vfile = new VFile();
  const parse = (s: string) => mystParse(s, { markdownit: { linkify: true }, directives: extDirectives, roles: extRoles, vfile });
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

  // mystmd resolves embeds and references to other pages from the whole project, so here we can only say they're coming.
  markUnresolved(tree, false);

  return { tree, blocks: toBlocks(tree), messages: vfile.messages.map((m) => m.message), frontmatter };
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
