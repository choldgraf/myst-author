// URLs are relative to the page so the app also works under a path prefix (e.g. jupyter-server-proxy).
const url = (path: string) => `api/files/${encodeURIComponent(path)}`;

// An error reply must never be read as file text, or autosave would write it back.
async function ok(r: Response) {
  if (!r.ok) throw new Error(await r.text());
  return r;
}

// The project folder as a `file://` URI, the root of the language server's document URIs.
export const projectRoot = (): Promise<string> => fetch('api/root').then(ok).then((r) => r.json()).then((r) => r.uri);
export const listFiles = (): Promise<string[]> => fetch('api/files').then(ok).then((r) => r.json());
export const readFile = (path: string) => fetch(url(path)).then(ok).then((r) => r.text());
export const writeFile = (path: string, text: string, keepalive = false) =>
  fetch(url(path), { method: 'PUT', body: text, keepalive }).then(ok).then(() => {});
