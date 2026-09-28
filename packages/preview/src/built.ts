import type { GenericParent } from 'myst-common';
import { toBlocks, type ParseResult } from './parse.ts';

/** The parts of a `myst start` page JSON (`/content/{slug}.json`) that we use. */
export type BuiltPage = {
  sha256: string;
  location: string;
  frontmatter?: Record<string, any>;
  mdast: GenericParent;
  references?: Record<string, any>;
};

/** Slugs of every page in a `myst start` project, from its `/config.json`. */
export function pageSlugs(config: any): string[] {
  const project = config.projects[0];
  return [project.index, ...project.pages.map((p: { slug?: string }) => p.slug).filter(Boolean)];
}

/** Render a page built by mystmd the same way as the fast in-browser parse. */
export function fromBuiltPage(page: BuiltPage): ParseResult {
  return {
    tree: page.mdast,
    blocks: toBlocks(page.mdast),
    messages: [],
    frontmatter: page.frontmatter ?? {},
    references: page.references,
  };
}

/** Hex SHA-256 of the text, as mystmd records it in page JSON. */
export async function sha256(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function json(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Load built pages from a `myst start` content server at `base` (e.g. `myst` or `http://localhost:3100`). */
export function builtPages(base: string) {
  // config.json lists slugs but not files, so map source location → slug by fetching each page once.
  let slugs = new Map<string, string>();
  let slugList = '';

  /** The built page JSON for a project-relative path, or null if mystmd hasn't built it. */
  async function page(path: string): Promise<BuiltPage | null> {
    const all = pageSlugs(await json(`${base}/config.json`));
    if (all.join() !== slugList) {
      const pages: BuiltPage[] = await Promise.all(all.map((s) => json(`${base}/content/${s}.json`)));
      slugs = new Map(pages.map((p, i) => [p.location, all[i]]));
      slugList = all.join();
    }
    const slug = slugs.get('/' + path);
    if (!slug) return null;
    const result: BuiltPage = await json(`${base}/content/${slug}.json`);
    rebaseImages(result.mdast, base);
    return result;
  }
  return {
    page,
    /** Source location (e.g. `/index.md`) → slug, as of the last `page()` call. */
    get slugs() {
      return slugs;
    },
  };
}

// Pages reference images at the content server's root (e.g. `/local-<hash>.png`).
function rebaseImages(node: any, base: string) {
  if (node.type === 'image') {
    for (const key of ['url', 'urlOptimized']) if (node[key]?.startsWith('/')) node[key] = base + node[key];
  }
  node.children?.forEach((c: any) => rebaseImages(c, base));
}

/** Call `onReload` whenever mystmd rebuilds (and on (re)connect) via its `/socket` URL; returns a cleanup function. */
export function watchBuilds(socketUrl: string, onReload: () => void) {
  let ws: WebSocket;
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  const connect = () => {
    ws = new WebSocket(socketUrl);
    ws.onopen = onReload;
    ws.onmessage = (e) => JSON.parse(String(e.data)).type === 'RELOAD' && onReload();
    ws.onclose = () => { if (!stopped) timer = setTimeout(connect, 2000); };
  };
  connect();
  return () => { stopped = true; clearTimeout(timer); ws.close(); };
}
