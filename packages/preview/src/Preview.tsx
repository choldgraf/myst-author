import type { MouseEvent } from 'react';
import { Theme } from '@myst-theme/common';
import { ArticleProvider, ThemeProvider } from '@myst-theme/providers';
import { SourceFileKind } from 'myst-spec-ext';
import { DEFAULT_RENDERERS, MyST } from 'myst-to-react';
import type { ParseResult } from './parse.ts';

type Props = {
  result: ParseResult;
  onLineClick?: (line: number) => void;
  /** Cmd/Ctrl-click on a link, with its raw `href`. The preview never navigates by itself. */
  onFollowLink?: (href: string) => void;
};

/** Render a parsed page block-by-block; each block carries its source line range for sync. */
export function Preview({ result, onLineClick, onFollowLink }: Props) {
  function onClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const href = target.closest('a')?.getAttribute('href');
    if (href != null) {
      // A plain click on a link jumps to its source like any other block.
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) return onFollowLink?.(href);
    }
    // Let tabs, dropdowns, and text selection work without jumping the editor.
    if (target.closest('button, summary, input, .cursor-pointer') || getSelection()?.toString()) return;
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
        <article className="article" onClick={onClick}>
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
