# @myst-author/lsp

A language server for MyST cross-references.
It speaks the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) (LSP), so any LSP client can use it.

## Run

```sh
node src/server.ts --stdio [--content-server=http://127.0.0.1:3100] [--root=path/to/project]
```

- `--content-server` (optional): URL of a `myst start --headless` content server.
  The server indexes every built page and reloads when the content server sends `RELOAD`.
  Without it, only open documents are indexed, and unknown targets aren't reported.
- `--root` (optional): the project folder.
  It overrides the client's, so a host that bridges untrusted clients (like the web app's `/lsp`) decides which folder the server reads.
- Hosts that start mystmd and the server get these arguments from `lspArgs(url, root)` in `@myst-author/lsp/myst`.

Otherwise the workspace root is the first workspace folder, or `rootUri` if there is none.
It's used to list files for path completion and to read `myst.yml` for external references.

## Capabilities

**Completion**

| Typing | Completes |
|---|---|
| `` {ref}` ``, `` {numref}` ``, `` {eq}` ``, `[](#`, `<#` | reference targets |
| `` {doc}` ``, `[](` | files, relative to the current file |
| ```` ```{ ````, `:::{` | directive names |
| `{` | role names |
| `:` on a line inside a directive's options | that directive's options, skipping ones already set |

Directive options come from mystmd's directive specs.

**Other features**

- **Hover** and **go to definition** on references.
- **Diagnostics**: warns about references to unknown targets.
  These are only reported with a content server, once the project has loaded.
- **Inlay hints**: the resolved text after each reference, e.g. `Figure 1` or `(1)`.
- **Workspace symbols**: every label, so clients can search for and jump to them.
- **External references** (`[](xref:key#target)`, `<xref:key/page#target>`): completion of keys, pages and targets, hover with the resolved URL, inlay hints with the remote title, diagnostics, and document links.
  Keys come from `project.references` in `myst.yml`.
  Each project's `myst.xref.json` (MyST) or `objects.inv` (Sphinx) is fetched on `initialize`.
  See [External references](https://choldgraf.github.io/myst-author/guide/references#external-references) for how targets are checked.

Open documents are re-parsed live with `@myst-author/preview/parse`, so unsaved labels are available immediately.

**Limits**: references inside code (fenced blocks, `{code-block}`, inline code) get no diagnostics, hover, or inlay hints.

## Code

- `src/syntax.ts`: finds reference syntax in text.
- `src/index-targets.ts`: collects reference targets from an mdast tree.
- `src/project.ts`: the project index (content server pages plus open documents).
- `src/xref.ts`: external project inventories and `xref:` resolution.
- `src/service.ts`: the features (completion, hover, diagnostics, ...) without an LSP connection, so tests can call them directly.
- `src/server.ts`: the LSP wiring.
- `src/client/`: the browser client (`@myst-author/lsp/client`), a `@codemirror/lsp-client` over a websocket, with inlay hints.
- `src/myst.ts`: starts `myst start --headless` (`@myst-author/lsp/myst`).
- `build.mjs`: bundles the server into `dist/server.cjs` with esbuild, which starts faster than the source.
  The VS Code extension builds its copy with the same function.
