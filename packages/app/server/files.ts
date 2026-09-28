import { readdir } from 'node:fs/promises';
import path from 'node:path';

const SKIP = new Set(['node_modules', '_build']);

/** Project-relative POSIX paths of all .md files, sorted. */
export async function listMarkdown(root: string, dir = ''): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(root, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listMarkdown(root, rel)));
    else if (e.name.endsWith('.md')) out.push(rel);
  }
  return out.sort();
}

/** Absolute path for a project-relative .md path; throws if it escapes the project. */
export function resolveInside(root: string, rel: string): string {
  const base = path.resolve(root);
  const abs = path.resolve(base, rel);
  if (!abs.startsWith(base + path.sep) || !abs.endsWith('.md')) throw new Error(`Refusing path: ${rel}`);
  return abs;
}
