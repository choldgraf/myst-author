/** Sends an LSP request, e.g. CodeMirror's `client.request` or vscode-languageclient's `sendRequest`. */
export type Request = (method: string, params: unknown) => Promise<unknown>;

type WorkspaceSymbol = { name: string; location: { uri: string; range: { start: { line: number } } } };

/** Where label `id` is defined, from the language server's workspace symbols. The server names each symbol by its lowercased label. */
export async function findLabel(request: Request, id: string): Promise<{ uri: string; line: number } | undefined> {
  const symbols = (await request('workspace/symbol', { query: id })) as WorkspaceSymbol[] | null;
  const s = symbols?.find((s) => s.name === id.toLowerCase());
  return s && { uri: s.location.uri, line: s.location.range.start.line };
}
