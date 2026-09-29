# @myst-author/lsp

A language server for MyST cross-references.
It speaks the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) (LSP), so any LSP client can use it.

## Run

```sh
node src/server.ts --stdio [--myst | --content-server=http://127.0.0.1:3100] [--root=path/to/project]
```

- `--content-server` (optional): URL of a `myst start --headless` content server.
  The server indexes every built page and reloads when the content server sends `RELOAD`.
  Without it, only open documents are indexed, and unknown targets aren't reported.
- `--myst` (optional): start `myst start --headless` in the project folder and use it as the content server.
  Use it with editors that don't start mystmd themselves, like Neovim.
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
| `@`, `[@` | citation keys and reference targets |
| `` {cite}` `` | citation keys |
| `` {doc}` ``, `[](` | files, relative to the current file |
| ```` ```{figure} ````, `{image}`, `{include}`, `{literalinclude}` argument | any file, relative to the current file |
| ```` ```{ ````, `:::{` | directive names |
| `{` | role names |
| `:` on a line inside a directive's options | that directive's options, skipping ones already set |

Directive options come from mystmd's directive specs.
Citation keys come from `project.bibliography` in `myst.yml`, or every `.bib` file in the project, as in mystmd.
They're read on startup.

**Other features**

- **Hover** and **go to definition** on references.
- **Hover** on directive names, directive options, and role names: the docs from mystmd's specs.
- **File arguments** of `figure`, `image`, `include`, and `literalinclude`: document links, go to definition, and a warning when the file doesn't exist.
  Like mystmd, paths are relative to the current file, or to the project root when they start with `/`.
  URLs, notebook cells (`#id`), and `.*` wildcards aren't checked.
- **Find references** and **rename** for labels, from a reference or from the label's definition (`(label)=`, `:label:`, `$$ (label)`).
  Both search the project's `.md` files on disk, using unsaved text for open documents.
  Rename edits every reference and the definition; it isn't offered for citations, external references, notebooks, or headings without an explicit label.
- **Diagnostics**: warns about references to unknown targets, and labels defined more than once in the project.
  These are only reported with a content server, once the project has loaded.
  Like mystmd, headings without an explicit label can share a name.
- **Inlay hints**: the resolved text after each reference, e.g. `Figure 1` or `(1)`.
- **Semantic tokens**: each reference is a `label` token, with its target's kind as a modifier (`label.figure`, `label.table`, `label.equation`, `label.heading`, ...), or `label.citation` for citations.
  The kinds are `semanticTokensLegend` in `src/service.ts`.
  To colour references to figures, in VS Code set `"editor.semanticTokenColorCustomizations": { "rules": { "label.figure": "#2a9d8f" } }`, or in Neovim `vim.api.nvim_set_hl(0, '@lsp.typemod.label.figure', { fg = '#2a9d8f' })`.
- **Citations** (`@key`, `[@a; @b]`, `` {cite:p}`a, b` ``): hover with author, year and title, go to definition in the `.bib` file, and diagnostics.
  Like mystmd, `@x` is a citation if the bibliography has `x`, else a reference to label `x`.
  Unknown keys are only reported when every bibliography file is local, so projects without a `.bib` get no citation warnings.
- **Workspace symbols**: every label, searchable by label or text, so clients can jump to them.
- **Document symbols**: the page outline, with headings nested by level and each section's labeled figures, tables, equations, ... under it.
  See [Find your way around](https://choldgraf.github.io/myst-author/guide/navigate) for how it compares to VS Code's Markdown outline.
- **External references** (`[](xref:key#target)`, `<xref:key/page#target>`): completion of keys, pages and targets, hover with the resolved URL, inlay hints with the remote title, diagnostics, and document links.
  Keys come from `project.references` in `myst.yml`.
  Each project's `myst.xref.json` (MyST) or `objects.inv` (Sphinx) is fetched on `initialize`.
  See [External references](https://choldgraf.github.io/myst-author/guide/references#external-references) for how targets are checked.

Open documents are re-parsed live with `@myst-author/preview/parse`, so unsaved labels are available immediately.

**Notebooks**: each Markdown cell is a document in its notebook's file, with all the features above.
Clients with notebook sync (VS Code) send cells as they are; other clients (JupyterLab) open each cell as a document `file:///path/nb.ipynb#<cell id>`.
Find references and rename search open cells, not notebooks on disk.

**Progress**: with a content server, clients that support it show "Loading project" until mystmd's first build is indexed.

**Limits**: references inside code (fenced blocks, `{code-block}`, inline code) get no diagnostics, hover, or inlay hints.

## Code

- `src/syntax.ts`: finds reference syntax in text.
- `src/index-targets.ts`: collects reference targets from an mdast tree.
- `src/project.ts`: the project index (content server pages plus open documents).
- `src/xref.ts`: external project inventories and `xref:` resolution.
- `src/cite.ts`: reads the project's `.bib` files.
- `src/service.ts`: the features (completion, hover, diagnostics, ...) without an LSP connection, so tests can call them directly.
- `src/server.ts`: the LSP wiring.
- `src/client/`: the browser client (`@myst-author/lsp/client`), a `@codemirror/lsp-client` over a websocket, with inlay hints.
- `src/myst.ts`: starts `myst start --headless` (`@myst-author/lsp/myst`).
- `build.mjs`: bundles the server into `dist/server.cjs` with esbuild, which starts faster than the source.
  The VS Code extension builds its copy with the same function.
