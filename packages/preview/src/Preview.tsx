import { useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Theme } from '@myst-theme/common';
import { ArticleProvider, ThemeProvider } from '@myst-theme/providers';
import Anser from 'anser';
import { escapeCarriageReturn } from 'escape-carriage';
import { SWRConfig, type Middleware } from 'swr';
import type { GenericNode } from 'myst-common';
import { SourceFileKind } from 'myst-spec-ext';
import { DEFAULT_RENDERERS, Details, MyST } from 'myst-to-react';
import { mystmdMissing, rebaseFetched, sha256, type Built } from '@myst-author/mystmd/built';
import { builtWithLines, fromBuiltPage, parseMyst, withBuiltBlocks, type ParseResult } from './parse.ts';

/**
 * What to preview for a file's live text: mystmd's build when it matches the text exactly, otherwise the fast in-browser parse,
 * in which blocks you haven't changed since the last matching build keep that build.
 * `badge` says which one it is.
 */
export function usePreview(path: string | undefined, text: string, dirty: boolean, built: Built | null) {
  // Parses on the main thread; deferring the text lets React keep typing responsive while it runs.
  const deferred = useDeferredValue(text);
  const [hashed, setHashed] = useState({ text: '', hash: '' });
  useEffect(() => {
    let current = true;
    sha256(deferred).then((hash) => current && setHashed({ text: deferred, hash }));
    return () => { current = false; };
  }, [deferred]);

  const current = built?.path === path ? built : null;
  const page = current?.page?.sha256 === hashed.hash ? current.page : null;
  // That build with the fast parse's lines, kept while you edit.
  const matched = useMemo(() => page && { path, text: hashed.text, result: builtWithLines(page, hashed.text) }, [page, hashed]);
  const kept = useRef(matched);
  if (matched) kept.current = matched;
  const result = useMemo(() => {
    if (page) return matched?.result ?? fromBuiltPage(page);
    const fast = parseMyst(deferred);
    const k = kept.current;
    return k?.result && k.path === path ? withBuiltBlocks(fast, deferred, k.result, k.text) : fast;
  }, [page, matched, deferred]);
  const badge = current?.error === mystmdMissing ? 'no mystmd'
    : page ? 'built ✓'
    : dirty ? 'fast preview · unsaved'
    : current?.page ? 'building…'
    : 'fast preview';
  return { result, badge };
}

// Code cell outputs, drawn like @myst-theme/jupyter's `Outputs` and `SafeOutput` on a mystmd site, with the same classes.
// That package also brings thebe and JupyterLab, so these copy its plain-HTML path.
// HTML output shows in a sandbox that doesn't run its scripts, which would run with the editor's access to your files.
// So outputs that need scripts, such as plotly, show their plain text.
function Outputs({ node }: { node: GenericNode }) {
  const align = node.align === 'center' ? 'text-center' : node.align === 'right' ? 'text-right' : 'text-left';
  const spacing = node.children?.some((c: GenericNode) => c.jupyter_data) ? 'mb-5' : '';
  const outputs = (
    <div id={node.identifier || undefined} className={`max-w-full overflow-y-visible m-0 not-prose relative ${align} ${spacing} ${node.visibility === 'remove' ? 'hidden' : ''}`}>
      <MyST ast={node.children} />
    </div>
  );
  return node.visibility === 'hide' ? <Details title="Output">{outputs}</Details> : outputs;
}

function Output({ node }: { node: GenericNode }) {
  const out = node.jupyter_data;
  const pre = (className: string, text: string) => <pre className={`text-sm font-thin font-system overflow-auto ${className}`}><Ansi text={text} /></pre>;
  if (out.output_type === 'stream') return pre(`myst-jp-stream-output ${out.name === 'stderr' ? 'jupyter-error' : 'jupyter-output'}`, [out.text].flat().join(''));
  if (out.output_type === 'error') return pre('myst-jp-error-output jupyter-error', [out.traceback ?? `${out.ename}: ${out.evalue}`].flat().join('\n'));
  const data = out.data ?? {};
  const image = ['image/png', 'image/jpeg', 'image/gif', 'image/bmp'].map((type) => data[type]).find(Boolean);
  const text = data['text/plain']?.content;
  const html: string | undefined = data['text/html']?.content;
  if (html && !/<script/i.test(html)) return <HtmlOutput html={html} />; // HTML that needs its scripts shows its plain text instead
  if (image) return <img src={image.path} alt={text ?? 'Image produced in Jupyter'} />;
  return (
    <div className="font-mono text-sm whitespace-pre-wrap myst-jp-safe-output-text">
      <Ansi text={text ?? `This output (${Object.keys(data).join(', ')}) shows on the built site, but not in the editor.`} />
    </div>
  );
}

/** HTML output, such as a pandas table, in an iframe that can't run scripts, sized to fit. */
function HtmlOutput({ html }: { html: string }) {
  const fit = (frame: HTMLIFrameElement) => frame.contentDocument && (frame.style.height = `${frame.contentDocument.body.scrollHeight}px`);
  const page = `<style>body { margin: 0; font: 14px system-ui, sans-serif; }</style>${html}`;
  return <iframe sandbox="allow-same-origin" srcDoc={page} onLoad={(e) => fit(e.currentTarget)} className="w-full border-0" />;
}

/**
 * ANSI-coloured text, with myst-theme's `ansi-*` classes, like the ANSI renderer that mystmd sites use.
 * That's a wrapper for anser and escape-carriage, which only supports React 18, so this does the same with them.
 */
function Ansi({ text }: { text: string }) {
  return Anser.ansiToJson(escapeCarriageReturn(text), { use_classes: true, remove_empty: true }).map((part, i) => (
    <span key={i} className={[part.fg && `${part.fg}-fg`, part.bg && `${part.bg}-bg`, part.decoration && `ansi-${part.decoration}`].filter(Boolean).join(' ') || undefined}>{part.content}</span>
  ));
}

/** An inline expression: mystmd's renderer, or its code in grey while the fast preview waits for mystmd to run it. */
function InlineExpression(props: { node: GenericNode }) {
  if (!props.node.pending) return <MystInlineExpression {...props} />;
  return <code style={{ color: '#888' }} title="mystmd runs this when it builds">{props.node.value}</code>;
}
const MystInlineExpression = DEFAULT_RENDERERS.inlineExpression.base as (props: { node: GenericNode }) => React.JSX.Element;

const renderers = { ...DEFAULT_RENDERERS, inlineExpression: InlineExpression, outputs: Outputs, output: Output };

/** Controls in a rendered page that handle their own clicks (tabs, dropdowns, buttons), so a click on them doesn't jump to the source. */
export const INTERACTIVE = 'button, summary, input, .cursor-pointer';

type Props = {
  result: ParseResult;
  /** The (1-based) source line to scroll to the top. */
  topLine?: number;
  onLineClick?: (line: number) => void;
  /**
   * Cmd/Ctrl-click on a link, with its raw `href`. The preview never navigates by itself.
   * For an in-page `#id` link, `line` is where the target renders, in case the host can't find the label.
   */
  onFollowLink?: (href: string, line?: number) => void;
};

// A cross-reference's hover card fetches its page from the content server, and myst-to-react fetches it with SWR.
// So this rebases that page's URLs too, and its images load (if myst-to-react stops using SWR, they break again).
const rebaseHoverPages: Middleware = (useSWRNext) => (key, fetcher, config) =>
  useSWRNext(key, fetcher && (async (url: string) => {
    const page: any = await fetcher(url);
    rebaseFetched(url, page);
    return page;
  }), config);

/** Render a parsed page block-by-block; each block carries its source line range for sync. */
export function Preview({ result, topLine, onLineClick, onFollowLink }: Props) {
  const article = useRef<HTMLElement>(null);

  useEffect(() => {
    if (topLine === undefined) return;
    const blocks = [...article.current!.querySelectorAll<HTMLElement>('[data-line-start]')];
    const el = blocks.findLast((b) => Number(b.dataset.lineStart) <= topLine) ?? article.current!;
    el.scrollIntoView({ block: 'start' });
  }, [topLine]);

  function onClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const href = target.closest('a')?.getAttribute('href');
    if (href != null) {
      // A plain click on a link jumps to its source like any other block.
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        const id = href.startsWith('#') ? decodeURIComponent(href.slice(1)) : '';
        const block = id ? article.current!.querySelector(`[id="${CSS.escape(id)}"]`)?.closest<HTMLElement>('[data-line-start]') : null;
        return onFollowLink?.(href, block ? Number(block.dataset.lineStart) : undefined);
      }
    }
    // Let tabs, dropdowns, and text selection work without jumping the editor.
    if (target.closest(INTERACTIVE) || getSelection()?.toString()) return;
    const block = target.closest<HTMLElement>('[data-line-start]');
    if (block) onLineClick?.(Number(block.dataset.lineStart));
  }

  return (
    <SWRConfig value={{ use: [rebaseHoverPages] }}>
      <ThemeProvider theme={Theme.light} setTheme={() => {}} renderers={renderers}>
        <ArticleProvider
          kind={SourceFileKind.Article}
          references={{ ...result.references, article: result.tree }}
          frontmatter={result.frontmatter}
        >
          <article className="article" onClick={onClick} ref={article}>
            {result.frontmatter.title && <h1 data-line-start={1}>{String(result.frontmatter.title)}</h1>}
            {result.blocks.map((b) => (
              <div key={b.node.key} data-line-start={b.start} data-line-end={b.end}>
                <MyST ast={b.node} />
              </div>
            ))}
          </article>
        </ArticleProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}
