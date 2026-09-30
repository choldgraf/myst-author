import { useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Theme } from '@myst-theme/common';
import { ArticleProvider, ThemeProvider } from '@myst-theme/providers';
import { SourceFileKind } from 'myst-spec-ext';
import { DEFAULT_RENDERERS, MyST } from 'myst-to-react';
import { mystmdMissing, sha256, type Built } from '@myst-author/mystmd/built';
import { fromBuiltPage, parseMyst, type ParseResult } from './parse.ts';

/**
 * What to preview for a file's live text: mystmd's build when it matches the text exactly, otherwise the fast in-browser parse.
 * `badge` says which one it is, and `builtMatch` is the matching build with the text it matches, for the live editor (`./live`).
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
  const builtMatch = useMemo(() => (page ? { page, text: hashed.text } : null), [page, hashed]);
  const result = useMemo(() => (page ? fromBuiltPage(page) : parseMyst(deferred)), [page, deferred]);
  const badge = current?.error === mystmdMissing ? 'no mystmd'
    : page ? 'built ✓'
    : dirty ? 'fast preview · unsaved'
    : current?.page ? 'building…'
    : 'fast preview';
  return { result, badge, builtMatch };
}

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
    <ThemeProvider theme={Theme.light} setTheme={() => {}} renderers={DEFAULT_RENDERERS}>
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
  );
}
