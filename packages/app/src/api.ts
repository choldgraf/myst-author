// URLs are relative to the page so the app also works under a path prefix (e.g. jupyter-server-proxy).
const url = (path: string) => `api/files/${encodeURIComponent(path)}`;

export const listFiles = (): Promise<string[]> => fetch('api/files').then((r) => r.json());
export const readFile = (path: string) => fetch(url(path)).then((r) => r.text());
export async function writeFile(path: string, text: string, keepalive = false) {
  const r = await fetch(url(path), { method: 'PUT', body: text, keepalive });
  if (!r.ok) throw new Error(await r.text());
}

/** The websocket URL for a path relative to the page. */
export const wsUrl = (path: string) => new URL(path, location.href).href.replace(/^http/, 'ws');
