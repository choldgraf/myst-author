import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { load } from 'js-yaml';

/** One target in an external project. `page` is set for MyST projects (e.g. `/tables`); `url` is absolute. */
export type XrefEntry = { name: string; kind: string; title?: string; url: string; page?: string; implicit?: boolean };

/** An external project from `project.references`. `entries` stays undefined until (and unless) its inventory loads. */
export type XrefProject = { url: string; kind?: 'myst' | 'sphinx'; entries?: XrefEntry[] };

/** Parse a Sphinx `objects.inv` (version 2): 4 header lines, then zlib-compressed `name domain:role priority uri dispname` lines. */
export function parseInventory(data: Buffer, base: string): XrefEntry[] {
  let start = 0;
  for (let i = 0; i < 4; i++) start = data.indexOf(10, start) + 1;
  return inflateSync(data.subarray(start))
    .toString('utf8')
    .split('\n')
    .flatMap((line) => {
      const m = line.match(/^(.+?)\s+(\S+:\S+)\s+-?\d+\s+(\S*)\s+(.*)$/);
      if (!m) return [];
      const [, name, kind, uri, title] = m;
      return [{ name, kind, title: title === '-' ? name : title, url: new URL(uri.replace(/\$$/, name), base).href }];
    });
}

/** Entries of a MyST site's `myst.xref.json`. `title` is read if present (proposed upstream, see upstream/U1). */
export function mystEntries(json: { references: any[] }, base: string): XrefEntry[] {
  return json.references.map((r) => ({
    name: r.identifier ?? '',
    kind: r.kind,
    title: r.title,
    url: base.replace(/\/$/, '') + r.url + (r.identifier ? `#${r.html_id ?? r.identifier}` : ''),
    page: r.url,
    implicit: r.implicit,
  }));
}

/** Split an `xref:` link target (`key/page#target`) into its parts, as mystmd does. */
export function splitXref(target: string) {
  const i = target.indexOf('#');
  const [path, hash] = i < 0 ? [target, ''] : [target.slice(0, i), target.slice(i + 1)];
  const slash = path.indexOf('/');
  return slash < 0 ? { key: path, page: '', hash } : { key: path.slice(0, slash), page: path.slice(slash), hash };
}

/** The entry an `xref:` target resolves to, following mystmd's matching rules (myst-transforms/src/links/{myst,sphinx}.ts). */
export function resolveXref(project: XrefProject, page: string, hash: string): XrefEntry | undefined {
  const entries = project.entries ?? [];
  if (project.kind === 'sphinx') {
    if (page) return;
    return hash ? entries.find((e) => e.name === hash) : { name: '', kind: 'project', url: project.url };
  }
  if (hash) return entries.find((e) => (page ? e.page === page : !e.implicit) && e.name === hash);
  return entries.find((e) => e.kind === 'page' && e.page === (page || '/'));
}

/** `project.references` from the workspace's `myst.yml` (key → url), or {} if there is none. */
export function readReferences(root: string): Record<string, string> {
  try {
    const refs = (load(readFileSync(join(root, 'myst.yml'), 'utf8')) as any)?.project?.references ?? {};
    return Object.fromEntries(Object.entries(refs).map(([k, v]: [string, any]) => [k, typeof v === 'string' ? v : v.url]));
  } catch {
    return {};
  }
}

/** Fetch a project's inventory: `myst.xref.json` first, then Sphinx `objects.inv`. Leaves `entries` undefined if both fail. */
export async function loadProject(project: XrefProject) {
  const base = project.url.replace(/\/?$/, '/');
  const json = await fetch(new URL('myst.xref.json', base)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (json?.references) {
    project.kind = 'myst';
    project.entries = mystEntries(json, base);
    return;
  }
  const inv = await fetch(new URL('objects.inv', base)).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  const data = inv && Buffer.from(inv);
  if (data?.toString('latin1', 0, 40).startsWith('# Sphinx inventory version 2')) {
    project.kind = 'sphinx';
    project.entries = parseInventory(data, base);
  }
}
