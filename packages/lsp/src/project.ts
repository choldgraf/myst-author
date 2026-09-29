import { contentServer } from '@myst-author/preview/built';
import { parseMyst } from '@myst-author/preview/parse';
import { targetsFromTree, type Target } from './index-targets.ts';

/**
 * The project's reference targets, keyed by file (project-relative path, e.g. `chapter.md`).
 * Built pages come from the `myst start` content server; open documents override their file with a live parse.
 */
export function createProject(url: string | undefined, onChange: () => void) {
  let built = new Map<string, Target[]>();
  const open = new Map<string, Target[]>();
  // Without a content server we only know the open documents, so we never claim a target is missing.
  let loaded = false;

  const server = url ? contentServer(url) : undefined;
  async function load() {
    built = new Map((await server!.pages()).map((page) => {
      const file = page.location.replace(/^\//, '');
      return [file, targetsFromTree(page.mdast, file)];
    }));
    loaded = true;
    onChange();
  }
  server?.watch(() => load().catch((e) => console.error(`[lsp] failed to load project: ${e}`)));

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
