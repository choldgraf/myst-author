import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from 'mystmd-client/content-server';

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

/** Absolute path for a project-relative .md path. Throws if it escapes the project. */
export function resolveInside(root: string, rel: string): string {
  const base = path.resolve(root);
  const abs = path.resolve(base, rel);
  if (!abs.startsWith(base + path.sep) || !abs.endsWith('.md')) throw new Error(`Refusing path: ${rel}`);
  return abs;
}

/**
 * Write `text` to `abs`, unless the file changed on disk (by an LLM, git, another editor) since the browser read it.
 * `base` is the hash of what the browser last read or saved. Without it, always writes. Returns whether it wrote.
 */
export async function writeUnlessChanged(abs: string, text: string, base?: string) {
  if (base && base !== (await sha256(await readFile(abs, 'utf8')))) return false;
  await writeFile(abs, text);
  return true;
}
