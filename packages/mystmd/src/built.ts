import type { GenericParent } from 'myst-common';

// mystmd-lsp (`src/mystmd/content-server.ts`) has a smaller copy of this client (`pages` and `watch`); port fixes between the two. A client exported by mystmd would replace both.

/** The parts of a `myst start` page JSON (`/content/{slug}.json`) that we use. */
export type BuiltPage = {
  sha256: string;
  location: string;
  frontmatter?: Record<string, any>;
  mdast: GenericParent;
  references?: Record<string, any>;
};

/** mystmd's latest build of a file, or why there is none. */
export type Built = { path: string; page: BuiltPage | null; error?: string };

/** The `error` when mystmd isn't installed; hosts that proxy the content server send it as the error body. */
export const mystmdMissing = 'mystmd not found';

/** Slugs of every page in a `myst start` project, from its `/config.json`; the index page first. */
function pageSlugs(config: any): string[] {
  const project = config.projects[0];
  return [project.index, ...project.pages.map((p: { slug?: string }) => p.slug).filter(Boolean)];
}

/** Hex SHA-256 of the text, as mystmd records it in page JSON. */
export async function sha256(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The hashes a build of `text` may have. mystmd hashes the file as saved, which may have CRLF line breaks where an editor's text has `\n`, so both are tried. */
export const savedHashes = (text: string) => Promise.all([sha256(text), sha256(text.replaceAll('\n', '\r\n'))]);

export type ContentServer = ReturnType<typeof contentServer>;

/**
 * The `myst start` content server at `base`: an absolute URL (`http://127.0.0.1:3100`), or one relative to the page (`myst`) when a host proxies it.
 * Image, output, and hover-card URLs point at `assets`, for when whoever displays the page reaches the server by another URL.
 */
export function contentServer(base: string, assets = base) {
  base = base.replace(/\/$/, '');
  // config.json lists slugs but not files, so map source location → slug by fetching each page once.
  let slugs = new Map<string, string>();
  let slugList = '';

  async function json(path: string) {
    const r = await fetch(`${base}/${path}`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  /** Learn each page's file from every built page, since config.json only lists slugs. */
  async function mapSlugs(all: string[]) {
    const result: BuiltPage[] = await Promise.all(all.map((s) => json(`content/${s}.json`)));
    slugs = new Map(result.map((p, i) => [p.location, all[i]]));
    slugList = all.join();
  }

  /** The built page JSON for a project-relative path, or null if mystmd hasn't built it. */
  async function page(path: string): Promise<BuiltPage | null> {
    const all = pageSlugs(await json('config.json'));
    if (all.join() !== slugList) await mapSlugs(all);
    const slug = slugs.get('/' + path);
    if (!slug) return null;
    const result: BuiltPage = await json(`content/${slug}.json`);
    rebaseUrls(result.mdast, assets);
    return result;
  }

  return {
    /** `page(path)` as a `Built`, with any failure as its `error`. */
    built(path: string): Promise<Built> {
      return page(path).then((p) => ({ path, page: p }), (err) => ({ path, page: null, error: err.message }));
    },

    /** The project-relative file for a page slug (`''` for the index page), as of the last `built()`. */
    fileForSlug(slug: string) {
      for (const [location, s] of slugs) if (s === slug || !slug) return location.slice(1);
    },

    /** Call `onReload` whenever mystmd rebuilds (and on (re)connect); returns a function that stops watching. */
    watch(onReload: () => void) {
      const url = new URL(`${base}/socket`, globalThis.location?.href).href.replace(/^http/, 'ws');
      let ws: WebSocket;
      let timer: ReturnType<typeof setTimeout>;
      let stopped = false;
      const connect = () => {
        ws = new WebSocket(url);
        ws.onopen = onReload;
        ws.onmessage = (e) => JSON.parse(String(e.data)).type === 'RELOAD' && onReload();
        ws.onclose = () => { if (!stopped) timer = setTimeout(connect, 2000); };
      };
      connect();
      return () => { stopped = true; clearTimeout(timer); ws.close(); };
    },
  };
}

// Pages reference images and code cell outputs at the content server's root (e.g. `/local-<hash>.png`).
// A cross-reference's `dataUrl`, the page its hover card fetches, is root-relative too, but the server has pages under `/content/` (see `rebaseFetched`).
function rebaseUrls(node: any, base: string) {
  if (node.type === 'image') {
    for (const key of ['url', 'urlOptimized']) if (node[key]?.startsWith('/')) node[key] = base + node[key];
  }
  if (node.type === 'crossReference' && node.dataUrl?.startsWith('/')) node.dataUrl = `${base}/content${node.dataUrl}`;
  if (node.type === 'output') {
    for (const d of Object.values<any>(node.jupyter_data?.data ?? {})) if (d.path?.startsWith('/')) d.path = base + d.path;
  }
  node.children?.forEach((c: any) => rebaseUrls(c, base));
}

/** Rebase a page that a cross-reference's hover card fetched from its `dataUrl` (`<base>/content/<slug>.json`), as `built()` does. */
export function rebaseFetched(url: string, page: BuiltPage | undefined) {
  const i = url.lastIndexOf('/content/');
  if (i >= 0 && page?.mdast) rebaseUrls(page.mdast, url.slice(0, i));
}
