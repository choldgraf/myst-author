---
title: How the repositories fit together
description: The repositories behind MyST Author, what each one owns, and where a new feature should go.
---

MyST Author is built from several repositories that are each useful on their own.
This page is the source of truth for how they relate; each repository documents its own interface.

```{mermaid}
flowchart LR
  subgraph author["myst-author"]
    hosts["Hosts<br/>web app · VS Code · JupyterLab"]
    preview["preview"]
  end
  lsp["mystmd-lsp<br/>language server"]
  client["mystmd-client<br/>mystmd helpers"]
  syntax["myst-syntax<br/>highlighting"]
  parser["myst-parser-unified<br/>micromark parser"]
  mystmd[("mystmd")]
  theme[("myst-theme")]
  hosts --> preview
  hosts -- "extension · package" --> lsp
  hosts -- "extension · package" --> syntax
  hosts -- "package" --> client
  preview -- "package" --> client
  preview --> theme
  lsp -- "package" --> client
  client --> mystmd
  parser -. "output compared with mystmd's parser" .-> mystmd
```

## What each one owns

| Repository | Owns | Useful on its own to |
|---|---|---|
| [mystmd](https://github.com/jupyter-book/mystmd) | What MyST means: parsing, transforms, builds, and the content server | Everyone |
| [mystmd-lsp](https://github.com/choldgraf/mystmd-lsp) | What an editor knows about a MyST project: references, labels, completion, hover, warnings | Any LSP editor (VS Code, Neovim, Helix) |
| [mystmd-client](https://github.com/choldgraf/mystmd-client) | Starting mystmd, reading its content server, and parsing one page the way mystmd does | Any tool that runs mystmd or parses a single page |
| [myst-syntax](https://github.com/choldgraf/myst-syntax) | Highlighting MyST syntax, for CodeMirror and TextMate, and the VS Code and JupyterLab extensions that ship it | Anyone who wants MyST highlighted in VS Code, JupyterLab, CodeMirror, or Shiki |
| [myst-parser-unified](https://github.com/choldgraf/myst-parser-unified) | Parsing MyST with micromark, with line and column positions on every node | People using the unified Markdown tools (remark), and mystmd as a possible future parser |
| [myst-author](https://github.com/choldgraf/myst-author) `packages/preview` | Rendering a page, live preview in CodeMirror, and choosing between the fast and built preview | Anyone embedding a MyST preview, once it's published |
| [myst-author](https://github.com/choldgraf/myst-author) hosts | Running mystmd and the language server, and anything that depends on the editor, such as documents, opening files and commands | People who want an editor |

The web app and JupyterLab hosts start mystmd and pass its address to the server.
In VS Code the MyST Language Server extension owns the server, which starts mystmd, and MyST Author asks it for the address through the server's `myst/project` request.
The web app and the VS Code live editor import `myst-syntax/codemirror` from the package, since a TextMate grammar doesn't reach a CodeMirror webview; VS Code's Markdown files get the grammar from the extension.
A host runs several language servers for one project (one per browser tab or VS Code live editor), and they all share one mystmd.

Nothing depends on [myst-parser-unified](https://chrisholdgraf.com/myst-parser-unified/) yet.
It's a candidate to replace the parser that mystmd-lsp and the preview use.
mystmd-lsp's design notes list [what a parser must provide to replace its regexes](https://chrisholdgraf.com/mystmd-lsp/design#replacing-the-reference-regexes).
Its `mystParse` drop-in matches the output of mystmd's parser, myst-parser, on 89 of 90 myst-spec examples (`npm run score` in that repository).

## Where a feature goes

Put each feature in the lowest repository that can hold it:

1. **mystmd**, if it's about what MyST means or what a build contains.
   Write it up as an [upstream proposal](upstream.md) and work around it until it lands.
2. **mystmd-lsp**, if an editor needs to know it.
   Every LSP editor then gets it, not just MyST Author's hosts.
3. **myst-syntax**, if it's about how MyST source looks.
4. **`packages/preview`**, if it's about how MyST renders.
   The web app, JupyterLab and the VS Code live editor all share it.
5. **A host**, only for what depends on that editor (see [Adding a host](architecture.md#adding-a-host)).

## Keeping them independent

- Repositories depend on each other only through published artifacts, a package from npm or git or an editor extension, never by path.
- A rule that one repository relies on is part of the other's documented interface.
  For example, MyST Author follows preview links to labels through mystmd-lsp's workspace symbols, so mystmd-lsp [documents how it names them](https://chrisholdgraf.com/mystmd-lsp/features#symbols).
  Likewise, MyST Author asks where the project is with mystmd-lsp's `myst/project` request, which its [configuration page](https://chrisholdgraf.com/mystmd-lsp/configuration) documents.
- When repositories recognise the same syntax, each one follows mystmd's rule and names where that rule lives, instead of copying another repository.
  For example, myst-syntax, mystmd-lsp and MyST Author's preview all find labels like `(intro)=` with the characters from mystmd's `TARGET_PATTERN`.
- Repositories don't copy code from each other.
  The mystmd helpers that start mystmd, read its content server, and parse one page live in [mystmd-client](https://github.com/choldgraf/mystmd-client), which mystmd-lsp and MyST Author both import.
  It's installed from GitHub, not npm, because it goes away once mystmd exports the helpers (U8 in [upstream proposals](upstream.md)).
