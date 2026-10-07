import { createRoot, type Root } from 'react-dom/client';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { forEachDiagnostic } from '@codemirror/lint';
import { Facet, Prec, StateEffect, StateField, type EditorState, type Extension, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, keymap, WidgetType, type DecorationSet } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { BuiltPage } from '@myst-author/mystmd/built';
import { fromBuiltPage, parseMyst, spans, withBuiltBlocks, withSourceLines, type Block, type ParseResult, type Span } from './parse.ts';
import { INTERACTIVE, Preview } from './Preview.tsx';

/** A span's character offsets in the editor, and an `id` for what it renders. (`start`/`end` are as of the last parse.) */
type Located = Span & { from: number; to: number; id: string };
/** The last parse, its spans moved through the edits since, and whether those edits left it `stale`. `built` is the last build that matched the editor's text, and that text. */
type Live = { result: ParseResult; spans: Located[]; stale: boolean; decorations: DecorationSet; built?: { result: ParseResult; text: string } };

const mounted = new WeakMap<HTMLElement, { root: Root; resize: ResizeObserver }>();

// The stylesheet for rendering blocks in shadow roots, when the host passes `css` (see `livePreview`).
const shadowStyles = Facet.define<CSSStyleSheet, CSSStyleSheet | undefined>({ combine: (sheets) => sheets[0] });

type FollowLink = (href: string, line?: number) => void;
// What Cmd/Ctrl-click on a rendered link does, when the host passes `onFollowLink` (see `livePreview`).
const linkFollower = Facet.define<FollowLink, FollowLink | undefined>({ combine: (fs) => fs[0] });

// Node positions and keys change on every parse; leave them out so unchanged blocks keep their DOM.
const identity = (blocks: Block[]) => JSON.stringify(blocks.map((b) => b.node), (k, v) => (k === 'position' || k === 'key' ? undefined : v));

/** A span rendered with the same component as the preview pane. */
class Rendered extends WidgetType {
  constructor(readonly result: ParseResult, readonly span: Located, readonly warn: boolean) {
    super();
  }

  eq(other: Rendered) {
    return other.span.id === this.span.id && other.warn === this.warn;
  }

  toDOM(view: EditorView) {
    const dom = document.createElement('div');
    dom.className = this.warn ? 'cm-live cm-live-warn' : 'cm-live';
    // The frontmatter span has no blocks, and renders as the page title; other spans leave the title out.
    const { title, ...rest } = this.result.frontmatter;
    const page = { ...this.result, blocks: this.span.blocks, frontmatter: this.span.blocks.length ? rest : this.result.frontmatter };
    const sheet = view.state.facet(shadowStyles);
    const shadow = sheet && dom.attachShadow({ mode: 'open' });
    if (shadow) shadow.adoptedStyleSheets = [sheet];
    const root = createRoot(shadow ? shadow.appendChild(document.createElement('div')) : dom);
    root.render(<Preview result={page} onFollowLink={view.state.facet(linkFollower)} />);
    // React renders after this returns, and images load and dropdowns open later: have CodeMirror measure the new height each time.
    const resize = new ResizeObserver(() => view.requestMeasure());
    resize.observe(dom);
    mounted.set(dom, { root, resize });
    // A click reveals the span's source, with the cursor on the clicked text.
    dom.addEventListener('mousedown', (e) => {
      const target = e.composedPath()[0] as Element; // the target inside a shadow root
      if (e.button !== 0 || target.closest?.(INTERACTIVE)) return;
      if ((e.metaKey || e.ctrlKey) && target.closest?.('a[href]')) return; // Preview follows the link on click, as in the preview pane
      e.preventDefault();
      const span = view.state.field(liveField).spans.find((s) => s.from === view.posAtDOM(dom));
      if (!span) return;
      view.dispatch({ selection: { anchor: sourceAt(view.state, span, e, dom.shadowRoot) } });
      view.focus();
    });
    return dom;
  }

  destroy(dom: HTMLElement) {
    const { root, resize } = mounted.get(dom)!;
    resize.disconnect();
    setTimeout(() => root.unmount()); // React warns about unmounting while it renders
  }

  ignoreEvent() {
    return true; // toDOM handles clicks
  }
}

/**
 * The source position of the clicked text: where the clicked text node's text appears in the span's source.
 * ponytail: the first match wins, so a repeated phrase can land on the wrong copy; falls back to the span's start.
 */
function sourceAt(state: EditorState, { from, to }: Located, e: MouseEvent, shadow: ShadowRoot | null) {
  const caret = document.caretPositionFromPoint?.(e.clientX, e.clientY, { shadowRoots: shadow ? [shadow] : [] });
  const range = caret ? null : document.caretRangeFromPoint?.(e.clientX, e.clientY); // Safari, which can't see into a shadow root
  const node = caret?.offsetNode ?? range?.startContainer;
  if (node?.nodeType !== Node.TEXT_NODE || !node.textContent) return from;
  // The renderer curls quotes; straighten them (same length, so offsets hold) to match the source.
  const i = state.doc.sliceString(from, to).indexOf(node.textContent.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'));
  return i < 0 ? from : from + i + (caret?.offset ?? range?.startOffset ?? 0);
}

const touches = (state: EditorState, s: Located) => state.selection.ranges.some((r) => r.from <= s.to && r.to >= s.from);
// Which spans the selection reveals, as a key to compare.
const revealed = (state: EditorState, located: Located[]) => located.flatMap((s, i) => (touches(state, s) ? [i] : [])).join();

/** Every span renders, except those the selection touches, which show their source. */
function decorate(state: EditorState, result: ParseResult, located: Located[]) {
  const warned = (s: Located) => {
    let found = false;
    forEachDiagnostic(state, (d) => { if (d.severity !== 'info' && d.severity !== 'hint' && d.from <= s.to && d.to >= s.from) found = true; });
    return found;
  };
  return Decoration.set(located.filter((s) => !touches(state, s)).map((s) =>
    Decoration.replace({ block: true, widget: new Rendered(result, s, warned(s)) }).range(s.from, s.to)));
}

/**
 * Render from mystmd's build of `text`, which resolves embeds and references to other pages, if the editor still has that text.
 * Until the next build, a block you edit renders from the fast parse, like the preview pane; the others keep the build.
 */
export const showBuilt = StateEffect.define<{ page: BuiltPage; text: string }>();

function build(state: EditorState, result?: ParseResult, built?: Live['built']): Live {
  const text = state.doc.toString();
  result ??= built ? withBuiltBlocks(parseMyst(text), text, built.result, built.text) : parseMyst(text);
  const located = spans(result, text.split('\n'))
    .filter((s) => s.end <= state.doc.lines)
    .map((s) => ({
      ...s,
      from: state.doc.line(s.start).from,
      to: state.doc.line(s.end).to,
      id: s.blocks.length ? identity(s.blocks) : String(result.frontmatter.title),
    }));
  return { result, spans: located, stale: false, decorations: decorate(state, result, located), built };
}

/**
 * Typing in the revealed span keeps the last parse and only moves the other spans, which haven't changed.
 * Anything else reparses: an edit outside it (undo, rename, replace all), or leaving it after editing, so an edited span renders its current text.
 * ponytail: a page parses in ~50 ms per 1,500 lines, a pause when you leave an edited block of a long page. Parse in a worker if that bites.
 */
function update(value: Live, tr: Transaction): Live {
  if (!tr.docChanged && !tr.selection && !tr.effects.length) return value; // effects include new diagnostics
  const built = tr.effects.find((e) => e.is(showBuilt))?.value;
  if (built && built.text === tr.state.doc.toString()) {
    // A copy: the preview pane renders the same page, and `fromBuiltPage` edits it.
    const result = withSourceLines(fromBuiltPage(structuredClone(built.page)), parseMyst(built.text));
    if (result) return build(tr.state, result, { result, text: built.text });
  }
  let local = true;
  tr.changes.iterChangedRanges((from, to) => {
    local &&= value.spans.some((s) => touches(tr.startState, s) && s.from <= from && to <= s.to);
  });
  // Text typed at a span's edges joins it.
  const moved = tr.docChanged ? value.spans.map((s) => ({ ...s, from: tr.changes.mapPos(s.from, -1), to: tr.changes.mapPos(s.to, 1) })) : value.spans;
  const stale = value.stale || tr.docChanged;
  if (stale && (!local || revealed(tr.startState, value.spans) !== revealed(tr.state, moved))) return build(tr.state, undefined, value.built);
  return { ...value, spans: moved, stale, decorations: decorate(tr.state, value.result, moved) };
}

const liveField = StateField.define<Live>({
  create: build,
  update,
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

/** Up and down arrows move into a rendered span, which reveals it, where CodeMirror would skip over it. */
function enter(forward: boolean) {
  return (view: EditorView) => {
    const cursor = view.state.selection.main;
    if (!cursor.empty) return false;
    const head = view.moveVertically(cursor, forward).head;
    const { spans } = view.state.field(liveField);
    const target = forward
      ? spans.find((s) => cursor.head < s.from && s.from < head)?.from
      : spans.findLast((s) => head < s.to && s.to < cursor.head)?.to;
    if (target === undefined) return false;
    view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
    return true;
  };
}

const arrows = Prec.high(keymap.of([{ key: 'ArrowDown', run: enter(true) }, { key: 'ArrowUp', run: enter(false) }]));

const theme = EditorView.baseTheme({
  // `flow-root` keeps the content's margins inside the widget, where CodeMirror measures its height.
  // The padding lines it up with the source lines, which keep the blank lines between blocks as the spacing.
  '.cm-live': { display: 'flow-root', whiteSpace: 'normal', fontFamily: 'system-ui, sans-serif', cursor: 'text', padding: '0 2px 0 6px' },
  '.cm-live [data-line-start] > *': { marginTop: '0', marginBottom: '0' },
  '.cm-live:hover': { outline: '1px dashed #ccd' },
  '.cm-live-warn': { borderLeft: '3px solid #f59e0b', paddingLeft: '0.5rem' },
});

/**
 * Render MyST in place in a CodeMirror editor: each block shows rendered, and the block with the cursor shows its source.
 * Like `Preview`, blocks need myst-theme's and KaTeX's CSS. By default that's the page's CSS.
 * A host whose own CSS clashes with it (JupyterLab) passes the CSS as `css`: blocks then render in shadow roots that share it.
 * KaTeX's fonts still need its CSS on the page, because shadow roots ignore `@font-face`. The host sets the editor's font.
 * `onFollowLink` handles Cmd/Ctrl-click on a rendered link, like `Preview`'s; a plain click shows the source.
 */
export function livePreview({ css, onFollowLink }: { css?: string; onFollowLink?: FollowLink } = {}): Extension {
  const base = [liveField, arrows, theme, onFollowLink ? linkFollower.of(onFollowLink) : []];
  if (!css) return base;
  const sheet = new CSSStyleSheet();
  // A shadow root has no `:root`, so myst-theme's colour variables go on its host instead.
  sheet.replaceSync(`${css.replaceAll(':root', ':host')}\n[data-line-start] > * { margin-top: 0; margin-bottom: 0 }`); // as the theme does outside shadow roots
  return [base, shadowStyles.of(sheet)];
}

/** Where the body starts, after any frontmatter. Editors start the cursor there, so live preview shows the page title rendered. */
export const bodyStart = (text: string) => /^---\n[\s\S]*?\n---\n/.exec(text)?.[0].length ?? 0;

/**
 * Live preview that reads like the page: a centred column, a proportional font (code stays monospace), and no gutters.
 * Source text and headings use the rendered page's sizes, so showing a block's source doesn't reflow the page.
 * The web app and the VS Code live editor use it; JupyterLab keeps Lab's editor look.
 */
export const pageLook: Extension = [
  EditorView.theme({
    // myst-theme's body text (Tailwind typography's `prose`).
    '.cm-content': { maxWidth: '46rem', margin: '0 auto', padding: '2.5rem 1.5rem 30vh', fontFamily: 'system-ui, sans-serif', fontSize: '16px', lineHeight: '1.75' },
    '.cm-gutters': { display: 'none' },
    '.cm-activeLine': { backgroundColor: 'transparent' }, // otherwise the blank line under the title, where the cursor starts, shows as a band
  }),
  // `prose`'s heading sizes. ponytail: hard-coded to match myst-theme; read its CSS if they drift.
  syntaxHighlighting(HighlightStyle.define([
    { tag: tags.monospace, fontFamily: 'monospace' },
    { tag: tags.heading1, fontSize: '2.25em', lineHeight: '1.11', fontWeight: '800' },
    { tag: tags.heading2, fontSize: '1.5em', lineHeight: '1.33', fontWeight: '700' },
    { tag: tags.heading3, fontSize: '1.25em', lineHeight: '1.6', fontWeight: '600' },
    { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '600' },
    { tag: tags.processingInstruction, color: '#9ca3af' }, // Markdown marks: `##`, `**`, `-`, `[]()`
  ])),
];
