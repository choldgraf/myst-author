# Upstream proposals from myst-author

These are proposals for the mystmd, myst-theme, and CodeMirror maintainers to decide on, not commitments.

| # | Proposal | Where | Status |
|---|---|---|---|
| U1 | [Richer xref entries: `title`, `enumerator`](U1-richer-xref-entries.md) | mystmd | written up |
| U2 | [Structured diagnostics over `/socket` and in page JSON](U2-structured-diagnostics.md) | mystmd | written up |
| U3 | MyST syntax highlighting for CodeMirror and TextMate: [myst-syntax](https://github.com/choldgraf/myst-syntax) | jupyter-book org | own repository |
| U4 | Language server: [mystmd-lsp](https://github.com/choldgraf/mystmd-lsp) | jupyter-book org | own repository |
| U5 | Reusable single-page browser preview (from `myst-demo`) | myst-theme | idea |
| U6 | `baseurl` fix for sites served under a sub-path, e.g. on JupyterHub ([mystmd#302](https://github.com/jupyter-book/mystmd/issues/302)) | myst-theme | idea |
| U7 | Column-accurate inline positions in myst-parser (large) | mystmd | idea |
| U8 | Export the helpers that MyST Author and mystmd-lsp share through [mystmd-client](https://github.com/choldgraf/mystmd-client): a single-page parse, a `myst start --headless` launcher, and a content-server client | mystmd | idea |
| U9 | [Inlay hints and requests from the server](U9-lsp-client-inlay-hints.md) | `@codemirror/lsp-client` | written up |
| U10 | [An mdast → mystmd adapter, to adopt a micromark parser](U10-mdast-adapter.md) | mystmd | written up |

## Data and packaging gaps (candidates for small fixes)

In built page JSON (`_build/site/content/*.json`, mystmd 1.10.1):

- Figure and table `container` nodes lose `position` after directive transforms, so go to definition lands on the caption instead of the directive line.
  The in-browser preview works around it by copying the directive's position onto its children before transforms.
- Inline positions are line-only (`column: 1`, end = start), and some `crossReference` nodes have no position at all.
  See U7.
- Nodes pulled in by `{include}` keep the included file's line numbers but don't record which file they came from.
  Editors then attribute them to the wrong file.

In `myst start`:

- It listens on IPv6 `localhost` only, so `127.0.0.1` fails.
  This could be documented, or it could bind both.
- It doesn't rewrite `myst.xref.json` on edits (see U1).

For embedding the myst-theme preview (U5):

- KaTeX CSS is needed but undocumented; without it, equations render twice.
- `@myst-theme/styles` ships no pre-built CSS, so embedders need Tailwind v3 and a config that points into `node_modules`.
- markdown-it's `punycode` import triggers a warning in Vite.
