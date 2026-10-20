import { createRoot, type Root } from 'react-dom/client';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { forEachDiagnostic } from '@codemirror/lint';
import { Facet, Prec, StateField, type EditorState, type Extension, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, keymap, WidgetType, type DecorationSet } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import * as mystmd from 'mystmd-client/parse';
import { showBuilt } from './built-match.ts';
import { builtWithLines, parseMyst, spans, withBuiltBlocks, type Block, type ParseResult, type Span } from './parse.ts';
import { INTERACTIVE, Preview } from './Preview.tsx';

/** A span's character offsets in the editor, and an `id` for what it renders. Its `start` and `end` lines are from the last parse. */
type Located = Span & { from: number; to: number; id: string };
/**
 * The last parse, and its spans moved through the edits since.
 * `stale` is true once those edits changed the text.
 * `built` is the last build that matched the editor's text, and that text.
 */
type Live = { result: ParseResult; spans: Located[]; stale: boolean; decorations: DecorationSet; built?: { result: ParseResult; text: string } };

const mounted = new WeakMap<HTMLElement, { root: Root; resize: ResizeObserver }>();

// The stylesheet for rendering blocks in shadow roots, when the host passes `css` (see `livePreview`).
const shadowStyles = Facet.define<CSSStyleSheet, CSSStyleSheet | undefined>({ combine: (sheets) => sheets[0] });

export type FollowLink = (href: string, line?: number) => void;
const linkFollower = Facet.define<FollowLink, FollowLink | undefined>({ combine: (fs) => fs[0] });
/** What a click on a rendered link does, like `Preview`'s `onFollowLink`. Without it, links do nothing. Cmd/Ctrl-click shows the source. */
export const followLinks = (f: FollowLink): Extension => linkFollower.of(f);

// Leave out node positions and keys, which change on every parse, so unchanged blocks keep their DOM.
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
    // The frontmatter span has no blocks, so it shows the page title and properties. Other spans leave the title out.
    const { title, ...rest } = this.result.frontmatter;
    const front = !this.span.blocks.length;
    const page = { ...this.result, blocks: this.span.blocks, frontmatter: front ? this.result.frontmatter : rest };
    const sheet = view.state.facet(shadowStyles);
    const shadow = sheet && dom.attachShadow({ mode: 'open' });
    if (shadow) shadow.adoptedStyleSheets = [sheet];
    const root = createRoot(shadow ? shadow.appendChild(document.createElement('div')) : dom);
    root.render(<>
      <Preview result={page} onFollowLink={view.state.facet(linkFollower)} />
      {front && <Properties source={view.state.sliceDoc(this.span.from, this.span.to)} />}
    </>);
    // React renders after this returns, and images load and dropdowns open later: have CodeMirror measure the new height each time.
    const resize = new ResizeObserver(() => view.requestMeasure());
    resize.observe(dom);
    mounted.set(dom, { root, resize });
    // A click reveals the span's source, with the cursor on the clicked text.
    dom.addEventListener('mousedown', (e) => {
      const target = e.composedPath()[0] as Element; // the target inside a shadow root
      if (e.button !== 0 || target.closest?.(INTERACTIVE)) return;
      if (!(e.metaKey || e.ctrlKey) && target.closest?.('a[href]') && view.state.facet(linkFollower)) return; // Preview follows the link on click, as in the preview pane
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
 * The frontmatter's keys other than the title, as Obsidian shows a note's properties.
 * They come from the YAML as written, not from mystmd's build, which adds the project's settings.
 * There's no form: a click shows the YAML with the cursor on the clicked value, like any other block.
 * Each value's `data-offset` is just after its key's colon, so a click looks for the value from there.
 * Invalid YAML never gets here: mystmd renders it as a code block.
 */
function Properties({ source }: { source: string }) {
  const { frontmatter } = mystmd.parseMyst(source);
  const { title, ...props } = typeof frontmatter === 'object' && frontmatter ? frontmatter : {};
  if (!Object.keys(props).length) return null;
  const after = (key: string) => {
    const at = source.indexOf(`\n${key}:`);
    return at < 0 ? 0 : at + key.length + 2;
  };
  // Each value is its own text node, so a click finds it in the source.
  const show = (v: unknown): React.ReactNode => v == null ? ''
    : v instanceof Date ? v.toISOString().slice(0, 10)
    : Array.isArray(v) ? v.map((x, i) => <span key={i} className="mr-1 rounded bg-gray-100 px-1.5">{show(x)}</span>)
    : typeof v === 'object' ? Object.entries(v).map(([k, x]) => <span key={k} className="mr-2"><span className="text-gray-500">{k}:</span> {show(x)}</span>)
    : String(v);
  return (
    <dl className="not-prose my-2 text-sm">
      {Object.entries(props).map(([key, value]) => (
        <div key={key} className="flex gap-4">
          <dt className="min-w-32 text-gray-500">{key}</dt>
          <dd className="m-0" data-offset={after(key)}>{show(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The source position of the clicked text: where the clicked text node's text appears in the span's source.
 * The first match wins, so a repeated phrase can land on the wrong copy.
 * The search starts at the nearest `data-offset`, if any, or else the span's start.
 * A miss falls back to that start.
 */
function sourceAt(state: EditorState, { from, to }: Located, e: MouseEvent, shadow: ShadowRoot | null) {
  const caret = document.caretPositionFromPoint?.(e.clientX, e.clientY, { shadowRoots: shadow ? [shadow] : [] });
  const range = caret ? null : document.caretRangeFromPoint?.(e.clientX, e.clientY); // Safari, which can't see into a shadow root
  const node = caret?.offsetNode ?? range?.startContainer;
  if (node?.nodeType !== Node.TEXT_NODE || !node.textContent) return from;
  const start = from + Number(node.parentElement?.closest<HTMLElement>('[data-offset]')?.dataset.offset ?? 0);
  // The renderer curls quotes. Straighten them (same length, so offsets hold) to match the source.
  const i = state.doc.sliceString(start, to).indexOf(node.textContent.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'));
  return i < 0 ? start : start + i + (caret?.offset ?? range?.startOffset ?? 0);
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

export { offerBuilt, showBuilt } from './built-match.ts';

function build(state: EditorState, result?: ParseResult, built?: Live['built']): Live {
  const text = state.doc.toString();
  result ??= built ? withBuiltBlocks(parseMyst(text), text, built.result, built.text) : parseMyst(text);
  const located = spans(result, text.split('\n'))
    .filter((s) => s.end <= state.doc.lines)
    .map((s) => {
      const from = state.doc.line(s.start).from;
      const to = state.doc.line(s.end).to;
      return { ...s, from, to, id: s.blocks.length ? identity(s.blocks) : state.sliceDoc(from, to) }; // the frontmatter span changes with its text
    });
  return { result, spans: located, stale: false, decorations: decorate(state, result, located), built };
}

/**
 * Typing in the revealed span keeps the last parse and only moves the other spans, which haven't changed.
 * Anything else reparses. That includes edits outside the span, such as undo, rename, or replace all.
 * It also includes leaving the span after editing it, so the edited span renders its current text.
 * A long page takes a noticeable pause to parse when you leave an edited block.
 */
function update(value: Live, tr: Transaction): Live {
  if (!tr.docChanged && !tr.selection && !tr.effects.length) return value; // effects include new diagnostics
  const built = tr.effects.find((e) => e.is(showBuilt))?.value;
  if (built && built.text === tr.state.doc.toString()) {
    const result = builtWithLines(built.page, built.text);
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
  // The padding lines the rendered text up with the source text.
  // The blank source lines between blocks give the spacing between them.
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
 * Add `followLinks` for clicks on rendered links.
 */
export function livePreview({ css }: { css?: string } = {}): Extension {
  const base = [liveField, arrows, theme];
  if (!css) return base;
  const sheet = shadowSheet(`${css}\n[data-line-start] > * { margin-top: 0; margin-bottom: 0 }`); // as the theme does outside shadow roots
  return [base, shadowStyles.of(sheet)];
}

/** The preview's CSS as a stylesheet for a shadow root. A shadow root has no `:root`, so myst-theme's colour variables go on its host instead. */
export function shadowSheet(css: string) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css.replaceAll(':root', ':host'));
  return sheet;
}

/** The (1-based) line at the top of the editor's viewport. */
export const topLine = (view: EditorView) => view.state.doc.lineAt(view.lineBlockAtHeight(view.scrollDOM.scrollTop).from).number;

/**
 * The CodeMirror offset where the body starts, after the page title's span or any frontmatter.
 * CodeMirror counts a CRLF as one character, so this counts offsets after turning CRLFs into LFs.
 * Editors start the cursor there, so live preview shows the title rendered.
 */
export function bodyStart(text: string) {
  const lf = text.replaceAll('\r\n', '\n');
  const lines = lf.split('\n');
  const [first] = spans(parseMyst(text), lines);
  if (first && !first.blocks.length) return Math.min(lines.slice(0, first.end).join('\n').length + 1, lf.length);
  return /^---\n[\s\S]*?\n---\n/.exec(lf)?.[0].length ?? 0;
}

/**
 * Live preview that reads like the page: a centred column, a proportional font (code stays monospace), and no gutters.
 * Source text and headings use the rendered page's sizes, so showing a block's source doesn't reflow the page.
 * The web editor and the VS Code live editor use it. JupyterLab keeps Lab's editor look.
 */
export const pageLook: Extension = [
  EditorView.theme({
    // myst-theme's body text (Tailwind typography's `prose`).
    '.cm-content': { maxWidth: '46rem', margin: '0 auto', padding: '2.5rem 1.5rem 30vh', fontFamily: 'system-ui, sans-serif', fontSize: '16px', lineHeight: '1.75', color: '#44403c' },
    '.cm-gutters': { display: 'none' },
    '.cm-activeLine': { backgroundColor: 'transparent' }, // otherwise the blank line under the title, where the cursor starts, shows as a band
  }),
  // `prose`'s sizes, weights, and colours, hard-coded to match myst-theme. Read its CSS if they drift.
  // Inline styles stay on in source, as in Obsidian, so bold text doesn't turn plain when you click it.
  syntaxHighlighting(HighlightStyle.define([
    // `labelName` is a code fence's info string, such as `{figure} path`, styled like the code below it.
    { tag: [tags.monospace, tags.labelName], fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.875em' },
    { tag: tags.heading1, fontSize: '2.25em', lineHeight: '1.11', fontWeight: '800', color: '#111827' },
    { tag: tags.heading2, fontSize: '1.5em', lineHeight: '1.33', fontWeight: '700', color: '#111827' },
    { tag: tags.heading3, fontSize: '1.25em', lineHeight: '1.6', fontWeight: '600', color: '#111827' },
    { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '600', color: '#111827' },
    { tag: tags.strong, fontWeight: '600', color: '#111827' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.link, fontWeight: '500', color: '#1d4ed8' },
    { tag: [tags.processingInstruction, tags.url], color: '#9ca3af' }, // Markdown marks (`##`, `**`, `-`, `[]()`) and link targets
  ])),
];
