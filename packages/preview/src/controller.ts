import type { ContentServer } from './built.ts';

/** The file the preview follows. `line` is the (1-based) line at the top of the editor. */
export type HostFile = { path: string; text: string; dirty: boolean; line?: number };

/**
 * What a host editor (VS Code, JupyterLab) provides to the preview.
 * Paths are project-relative with `/` separators, like mystmd's page `location`; `open` takes a 0-based line.
 */
export type PreviewHost = {
  current(): HostFile | undefined | Promise<HostFile | undefined>;
  post(message: object): void; // to the preview page
  open(path: string, line: number): void;
  openExternal(url: string): void;
  findLabel(id: string): Promise<{ path: string; line: number } | undefined>; // hosts ask their LSP client for `workspace/symbol`
  warn(message: string): void;
};

/** The host side of the preview page (`./page`): sends it the current file and its build, and answers its messages. */
export class PreviewController {
  /** mystmd's built pages: undefined while mystmd starts, null if it isn't available. */
  pages?: ContentServer | null;
  private host: PreviewHost;

  constructor(host: PreviewHost) {
    this.host = host;
  }

  /** Call when the current file's text or dirty flag changes. */
  async sendText() {
    const file = await this.host.current();
    if (file) this.host.post({ type: 'text', path: file.path, text: file.text, dirty: file.dirty });
  }

  /** Call when mystmd rebuilds, and when the host follows another file. */
  async sendBuilt() {
    const path = (await this.host.current())?.path;
    if (path === undefined || this.pages === undefined) return;
    if (this.pages === null) return this.host.post({ type: 'built', path, page: null, error: 'mystmd not found' });
    try {
      this.host.post({ type: 'built', path, page: await this.pages.page(path) });
    } catch (err) {
      this.host.post({ type: 'built', path, page: null, error: (err as Error).message });
    }
  }

  /** Call when the editor scrolls, with its (1-based) top line. */
  scroll(line: number) {
    this.host.post({ type: 'scroll', line });
  }

  /** Answer a message from the preview page. */
  async onMessage(m: { type: string; line?: number; href?: string }) {
    const file = await this.host.current();
    if (!file) return;
    if (m.type === 'ready') {
      this.sendText();
      this.sendBuilt();
      if (file.line) this.scroll(file.line);
    } else if (m.type === 'reveal') {
      this.host.open(file.path, m.line! - 1);
    } else if (m.type === 'follow') {
      await followLink({ ...this.host, fileForSlug: (slug) => this.pages?.fileForSlug(slug) }, file.path, m.href!, m.line);
    }
  }
}

/** What following a preview link needs from the host. */
export type LinkHost = Pick<PreviewHost, 'open' | 'openExternal' | 'findLabel' | 'warn'> & {
  fileForSlug(slug: string): string | undefined; // see `ContentServer`
};

/** Cmd/Ctrl-click on a preview link in file `here`; `line` is where an in-page `#id` target renders, if found. */
export async function followLink(host: LinkHost, here: string, href: string, line?: number) {
  if (/^[a-z][\w+.-]*:/i.test(href)) return host.openExternal(href); // http:, mailto:, …
  const [path, id] = href.split('#');
  if (id) {
    // Labels are project-wide, so ask the LSP where it is.
    const target = await host.findLabel(id).catch(() => undefined);
    if (target) return host.open(target.path, target.line);
    if (line && !path) return host.open(here, line - 1);
  }
  // Built pages link to other pages by slug (`/slug`, `/` for the index); the fast preview keeps the author's relative path.
  const target = !path ? here
    : path.startsWith('/') ? host.fileForSlug(path.slice(1))
    : decodeURIComponent(new URL(path, `http://x/${here}`).pathname.slice(1));
  if (target === undefined) host.warn(`Can't follow ${href}`);
  else host.open(target, 0);
}
