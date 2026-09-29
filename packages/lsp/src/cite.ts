import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';

/** A BibTeX entry. `file` is an absolute path; `line` is 0-based. */
export type BibEntry = { key: string; file: string; line: number; author?: string; year?: string; title?: string };

// A regex reader, not a full BibTeX parser: field values may nest braces one level deep, and `@string` macros aren't expanded.
export function parseBib(text: string, file: string): BibEntry[] {
  const entries = [...text.matchAll(/^[ \t]*@(\w+)\s*\{\s*([^,\s]+)\s*,/gm)];
  return entries.flatMap((m, i) => {
    if (/^(comment|string|preamble)$/i.test(m[1])) return [];
    const body = text.slice(m.index, entries[i + 1]?.index);
    const field = (name: string) => {
      const f = body.match(new RegExp(`\\b${name}\\s*=\\s*(?:\\{((?:[^{}]|\\{[^{}]*\\})*)\\}|"([^"]*)"|(\\w+))`, 'i'));
      return f && (f[1] ?? f[2] ?? f[3]).replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
    };
    const line = text.slice(0, m.index).split('\n').length - 1;
    return [{ key: m[2], file, line, author: field('author') ?? undefined, year: field('year') ?? undefined, title: field('title') ?? undefined }];
  });
}

/** "Nelson 1977", "Nelson et al. 1977": the first author's last name and the year. */
export function authorYear(e: BibEntry) {
  const [first, ...rest] = e.author?.split(/\s+and\s+/) ?? [];
  const last = first && (first.includes(',') ? first.split(',')[0] : first.split(' ').at(-1));
  return [last && (rest.length ? `${last} et al.` : last), e.year].filter(Boolean).join(' ');
}

/**
 * Entries from `project.bibliography` in myst.yml, else from `found` (every `.bib` in the project), as mystmd does.
 * `complete` is false when there's no bibliography or part of it is remote, so unknown keys can't be flagged.
 */
export function readBibliography(root: string, found: string[]) {
  let files = found;
  try {
    files = [(load(readFileSync(join(root, 'myst.yml'), 'utf8')) as any)?.project?.bibliography ?? found].flat();
  } catch {}
  const local = files.filter((f) => !/^https?:/.test(f)).map((f) => resolve(root, f));
  const entries = local.flatMap((f) => {
    try {
      return parseBib(readFileSync(f, 'utf8'), f);
    } catch {
      return [];
    }
  });
  return { entries, complete: files.length > 0 && local.length === files.length };
}
