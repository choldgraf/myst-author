import { mystmdMissing, type Built, type ContentServer } from './built.ts';

/** Messages from the host to the preview page (`./page`). */
export type ToPage =
  | { type: 'text'; path: string; text: string; dirty: boolean }
  | ({ type: 'built' } & Built)
  | { type: 'scroll'; line: number };

/** Messages from the preview page to the host; lines are 1-based. */
export type FromPage =
  | { type: 'ready' }
  | { type: 'reveal'; line: number }
  | { type: 'follow'; href: string; line?: number };

/** The file the preview follows. `line` is the (1-based) line at the top of the editor. */
export type HostFile = { path: string; text: string; dirty: boolean; line?: number };

/**
 * What a host editor (VS Code, JupyterLab) provides to the preview.
 * Paths are project-relative with `/` separators, like mystmd's page `location`; `open` takes a 0-based line.
 */
export type PreviewHost = {
  current(): HostFile | undefined | Promise<HostFile | undefined>;
  post(message: ToPage): void; // to the preview page
  open(path: string, line: number): void;
  openExternal(url: string): void;
  findLabel(id: string): Promise<{ path: string; line: number } | undefined>; // hosts ask their LSP client for `workspace/symbol`
  warn(message: string): void;
};

/** The host side of the preview page (`./page`): sends it the current file and its build, and answers its messages. */
export class PreviewController {
  private host: PreviewHost;
  private server?: ContentServer | null; // undefined while mystmd starts, null if it isn't available
  private stop?: () => void;
  private disposed = false;

  /** `server` resolves to mystmd's content server once it's up, or to null without mystmd. */
  constructor(host: PreviewHost, server: Promise<ContentServer | null>) {
    this.host = host;
    server
      .catch((err) => {
        host.warn(`mystmd didn't start: ${err.message}`);
        return null;
      })
      .then((s) => {
        if (this.disposed) return;
        this.server = s;
        this.stop = s?.watch(() => this.sendBuilt());
        this.sendBuilt();
      });
  }

  /** Send the current file and its build; call when the host follows another file. */
  sendFile() {
    this.sendText();
    this.sendBuilt();
  }

  /** Call when the current file's text or dirty flag changes. */
  async sendText() {
    const file = await this.host.current();
    if (file) this.host.post({ type: 'text', path: file.path, text: file.text, dirty: file.dirty });
  }

  /** Call when the editor scrolls, with its (1-based) top line. */
  scroll(line: number) {
    this.host.post({ type: 'scroll', line });
  }

  /** Answer a message from the preview page. */
  async onMessage(m: FromPage) {
    const file = await this.host.current();
    if (!file) return;
    if (m.type === 'ready') {
      this.sendFile();
      if (file.line) this.scroll(file.line);
    } else if (m.type === 'reveal') {
      this.host.open(file.path, m.line - 1);
    } else if (m.type === 'follow') {
      await followLink({ ...this.host, fileForSlug: (slug) => this.server?.fileForSlug(slug) }, file.path, m.href, m.line);
    }
  }

  dispose() {
    this.disposed = true;
    this.stop?.();
  }

  private async sendBuilt() {
    const path = (await this.host.current())?.path;
    if (path === undefined || this.server === undefined) return;
    if (this.server === null) return this.host.post({ type: 'built', path, page: null, error: mystmdMissing });
    try {
      this.host.post({ type: 'built', path, page: await this.server.page(path) });
    } catch (err) {
      this.host.post({ type: 'built', path, page: null, error: (err as Error).message });
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
