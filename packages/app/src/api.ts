// URLs are relative to the page so the app also works under a path prefix (e.g. jupyter-server-proxy).
const url = (path: string) => `api/files/${encodeURIComponent(path)}`;

// An error reply must never be read as file text, or autosave would write it back.
async function ok(r: Response) {
  if (!r.ok) throw Object.assign(new Error(await r.text()), { status: r.status });
  return r;
}

// The project folder as a `file://` URI, the root of the language server's document URIs.
export const projectRoot = (): Promise<string> => fetch('api/root').then(ok).then((r) => r.json()).then((r) => r.uri);
export const listFiles = (): Promise<string[]> => fetch('api/files').then(ok).then((r) => r.json());
export const readFile = (path: string) => fetch(url(path)).then(ok).then((r) => r.text());
// `base` is the hash of the text this replaces. If the file on disk no longer matches it, the server refuses with 409.
export const writeFile = (path: string, text: string, { base, keepalive = false }: { base?: string; keepalive?: boolean } = {}) =>
  fetch(url(path), { method: 'PUT', body: text, keepalive, headers: base ? { 'if-match': base } : {} }).then(ok).then(() => {});
