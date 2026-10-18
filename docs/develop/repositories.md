---
title: How the repositories fit together
description: The repositories behind MyST Author, what each one owns, and where a new feature should go.
---

MyST Author is built from several repositories that are each useful on their own.
This page is the source of truth for how they relate.
Each repository documents its own interface.

```{mermaid}
flowchart LR
  subgraph author["myst-author"]
    hosts["Hosts<br/>web editor · VS Code · JupyterLab"]
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
  lsp -- "extension" --> syntax
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
| [myst-author](https://github.com/choldgraf/myst-author) hosts | Running mystmd and the language server where no extension does, and anything that depends on the editor, such as documents, opening files and commands | People who want an editor |

The web editor, VS Code and JupyterLab each start mystmd and the language server their own way, as [Architecture](architecture.md#how-the-web-editor-fits-together) describes.

Nothing depends on [myst-parser-unified](https://chrisholdgraf.com/myst-parser-unified/) yet.
It's a candidate to replace the parser that mystmd-lsp and the preview use.
mystmd-lsp's design notes list [what a parser must provide to replace its regexes](https://chrisholdgraf.com/mystmd-lsp/design#replacing-the-reference-regexes).
Its `mystParse` function is a drop-in replacement for mystmd's parser.
It gives the same tree as mystmd on nearly every MyST example in myst-spec.

## Where a feature goes

Put each feature in the lowest repository that can hold it:

1. **mystmd**, if it's about what MyST means or what a build contains.
   Write it up as an [upstream proposal](upstream.md) and work around it until mystmd ships it.
2. **mystmd-lsp**, if an editor needs to know it.
   Every LSP editor then gets it, not just MyST Author's hosts.
3. **myst-syntax**, if it's about how MyST source looks.
4. **`packages/preview`**, if it's about how MyST renders.
   The web editor, JupyterLab and the VS Code live editor all share it.
5. **A host**, only for what depends on that editor (see [Adding a host](architecture.md#adding-a-host)).

## Keeping them independent

- Repositories depend on each other only through published packages and extensions, never by path.
- If one repository relies on a rule in another, that rule is part of the other's documented interface.
  For example, MyST Author follows preview links through mystmd-lsp's workspace symbols, so mystmd-lsp [documents how it names them](https://chrisholdgraf.com/mystmd-lsp/features#symbols).
- When repositories recognise the same syntax, each one follows mystmd's rule and says where in mystmd that rule lives.
  They don't copy it from another repository.
