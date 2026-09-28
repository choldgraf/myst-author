import { builtPages, watchBuilds as watch } from '@myst-author/preview/built';
import { wsUrl } from './api.ts';

export { sha256 } from '@myst-author/preview/built';

// The host server proxies the content server under myst/ (relative, like every app URL).
const pages = builtPages('myst');

/** The built page JSON for a project-relative path, or null if mystmd hasn't built it. */
export const builtPage = pages.page;

/** Call `onReload` whenever mystmd rebuilds (and on (re)connect); returns a cleanup function. */
export function watchBuilds(onReload: () => void) {
  return watch(wsUrl('myst/socket'), onReload);
}

/** The project-relative file for a built page slug (e.g. `cross-references`), if mystmd has built it. */
export function fileForSlug(slug: string) {
  for (const [location, s] of pages.slugs) if (s === slug) return location.slice(1);
}
