import { pageSlugs } from '@myst-author/preview/built';
import { parseMyst } from '@myst-author/preview/parse';
import { targetsFromTree, type Target } from './index-targets.ts';

/**
 * The project's reference targets, keyed by file (project-relative path, e.g. `chapter.md`).
 * Built pages come from the `myst start` content server; open documents override their file with a live parse.
 */
export function createProject(contentServer: string | undefined, onChange: () => void) {
  let built = new Map<string, Target[]>();
  const open = new Map<string, Target[]>();
  // Without a content server we only know the open documents, so we never claim a target is missing.
  let loaded = false;

  async function load() {
    const get = async (path: string) => (await fetch(new URL(path, contentServer))).json();
    const pages = await Promise.all(pageSlugs(await get('/config.json')).map((slug) => get(`/content/${slug}.json`)));
    built = new Map(pages.map((page) => {
      const file = page.location.replace(/^\//, '');
      return [file, targetsFromTree(page.mdast, file)];
    }));
    loaded = true;
    onChange();
  }

  // The content server sends RELOAD after each rebuild; reconnect if it goes away (e.g. still starting up).
  function connect() {
    const ws = new WebSocket(new URL('/socket', contentServer!.replace(/^http/, 'ws')));
    const reload = () => load().catch((e) => console.error(`[lsp] failed to load project: ${e}`));
    ws.onopen = reload;
    ws.onmessage = (e) => JSON.parse(String(e.data)).type === 'RELOAD' && reload();
    ws.onclose = () => setTimeout(connect, 2000);
  }
  if (contentServer) connect();

  return {
    get loaded() {
      return loaded;
    },
    targets(): Target[] {
      const files = new Set([...built.keys(), ...open.keys()]);
      return [...files].flatMap((f) => open.get(f) ?? built.get(f)!);
    },
    setOpen(file: string, text: string) {
      open.set(file, targetsFromTree(parseMyst(text).tree, file));
      onChange();
    },
    close(file: string) {
      open.delete(file);
      onChange();
    },
  };
}
