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
  syntax["myst-syntax<br/>highlighting"]
  parser["myst-parser-unified<br/>micromark parser"]
  mystmd[("mystmd")]
  theme[("myst-theme")]
  hosts --> preview
  hosts -- "package" --> lsp
  hosts -- "package" --> syntax
  preview --> mystmd
  preview --> theme
  lsp --> mystmd
  parser -. "compares against" .-> mystmd
```

## What each one owns

| Repository | Owns | Useful on its own to |
|---|---|---|
| [mystmd](https://github.com/jupyter-book/mystmd) | What MyST means: parsing, transforms, builds, and the content server | Everyone |
| [mystmd-lsp](https://github.com/choldgraf/mystmd-lsp) | What an editor knows about a MyST project: references, labels, completion, hover, warnings | Any LSP editor (Neovim, Helix) |
| [myst-syntax](https://github.com/choldgraf/myst-syntax) | Highlighting MyST syntax, for CodeMirror and TextMate | VS Code extensions and CodeMirror editors |
| [myst-parser-unified](https://github.com/choldgraf/myst-parser-unified) | Parsing MyST with micromark, and how its trees differ from mystmd's | People using the unified Markdown tools (remark), and mystmd as a possible future parser |
| [myst-author](https://github.com/choldgraf/myst-author) `packages/preview` | Rendering a page, live preview in CodeMirror, and choosing between the fast and built preview | Anyone embedding a MyST preview, once it's published |
| [myst-author](https://github.com/choldgraf/myst-author) hosts | Running mystmd and the language server, and anything that depends on the editor, such as documents, opening files and commands | People who want an editor |

Hosts start mystmd themselves and pass its address to mystmd-lsp, even though mystmd-lsp can start it.
A host runs several language servers for one project (one per browser tab or VS Code live editor), and they all share one mystmd.

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

- Repositories depend on each other only through packages, from npm or git, never by path.
- A rule that one repository relies on is part of the other's documented interface.
  For example, MyST Author follows preview links to labels through mystmd-lsp's workspace symbols, so mystmd-lsp [documents how it names them](https://chrisholdgraf.com/mystmd-lsp/features#symbols).
- When repositories recognise the same syntax, each one follows mystmd's rule and names where that rule lives, instead of copying another repository.
  For example, myst-syntax, mystmd-lsp and MyST Author's preview all find labels like `(intro)=` with the characters from mystmd's `TARGET_PATTERN`.
- Code copied between repositories says where its twin is, and why there's a copy.
  The only copies are the mystmd helpers that start mystmd, read its content server, and parse one page.
  mystmd-lsp and MyST Author both need them until mystmd exports them (U8 in [upstream proposals](upstream.md)).
