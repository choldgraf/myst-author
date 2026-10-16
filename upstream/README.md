# Upstream proposals from myst-author

These are proposals for the maintainers of the projects MyST Author builds on to decide on, not commitments.

Ranked by benefit over cost, best first.
The number is only an id.
The next step says what each one needs: a PR we can open, an issue with a repro, or a design discussion before any code.

| # | Proposal | Where | Next step |
|---|---|---|---|
| U1 | [Richer xref entries: `title`, `enumerator`](U1-richer-xref-entries.md) | mystmd | PR: a few additive lines, plus the one-line fix so `myst start` rewrites `myst.xref.json` on edits |
| U2 | [Structured diagnostics over `/socket` and in page JSON](U2-structured-diagnostics.md) | mystmd | PR for the websocket part. The page-JSON part can wait |
| U13 | Injected grammars are dropped once two of Markdown's lazily embedded languages load. The load order that avoids it is in [myst-syntax's README](https://github.com/choldgraf/myst-syntax#readme) | Shiki | Issue with the repro from `shiki.test.ts` |
| U9 | [Inlay hints and requests from the server](U9-lsp-client-inlay-hints.md) | `@codemirror/lsp-client` | PR for request handlers. Discussion first for inlay hints |
| U8 | Export the helpers that MyST Author and mystmd-lsp share through [mystmd-client](https://github.com/choldgraf/mystmd-client): a single-page parse, a `myst start --headless` launcher, a content-server client, and finding which `myst.yml` governs a file | mystmd | Discussion, leading with the single-page parse. This is the biggest deletion on our side, a whole repository |
| U12 | Let an extension add CodeMirror extensions to a language Lab has already registered. [jupyterlab-myst-syntax](https://github.com/choldgraf/myst-syntax/tree/main/packages/jupyterlab) overwrites the registered entry's `support` field, which works but isn't documented | JupyterLab | Issue. Documenting that `support` is writable would be enough |
| U6 | [`baseurl` fix for sites served under a sub-path, e.g. on JupyterHub](https://github.com/jupyter-book/mystmd/issues/302) | myst-theme | Write up which URLs break, then a PR |
| U11 | Send notebook Markdown cells to language servers, so MyST (and any Markdown server) works in cells through the standard client. MyST Author's JupyterLab extension carries its own client only because of this | jupyterlab-lsp | Design discussion, since it changes the virtual-document model |
| U7 | [Column-accurate inline positions in myst-parser](https://github.com/jupyter-book/mystmd/issues/2864) | mystmd | Large. It would remove mystmd-lsp's reference regexes and conformance script |
| U5 | Reusable single-page browser preview (from `myst-demo`) | myst-theme | File the packaging gaps below as small issues. The rest only if someone else wants an embeddable preview |
| U10 | [An mdast → mystmd adapter, to adopt a micromark parser](U10-mdast-adapter.md) | mystmd | Discussed in the [unified-native parser issue](https://github.com/jupyter-book/mystmd/issues/1705). Depends on wanting U7's outcome |

## Repositories offered to jupyter-book

Not ranked with the proposals, since they are a governance conversation rather than a change to merge.

- U3: MyST syntax highlighting for CodeMirror and TextMate, with the VS Code and JupyterLab extensions: [myst-syntax](https://github.com/choldgraf/myst-syntax).
- U4: the language server, with its VS Code extension: [mystmd-lsp](https://github.com/choldgraf/mystmd-lsp).

## Data and packaging gaps (file as small bug reports)

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
- `config.json` lists each page's `slug`, `title` and `level` but not its file, so a table of contents that opens files has to fetch every page's JSON to learn them.

For embedding the myst-theme preview (U5):

- KaTeX CSS is needed but undocumented. Without it, equations render twice.
- `@myst-theme/styles` ships no pre-built CSS, so embedders need Tailwind v3 and a config that points into `node_modules`.
- markdown-it's `punycode` import triggers a warning in Vite.
