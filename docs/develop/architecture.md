---
title: Architecture
description: The packages that make up MyST Author and how they talk to each other.
---

MyST Author is a set of small packages in one repository.
For how it fits with mystmd-lsp, myst-syntax and the other repositories, see [How the repositories fit together](repositories.md).
The editor features live in reusable packages, and each host (the web editor, VS Code, JupyterLab) puts them together.

## Packages

The language server (mystmd-lsp) and the mystmd helpers (mystmd-client) live in their own repositories, as [What each one owns](repositories.md#what-each-one-owns) describes.
The packages here read built pages from mystmd's *content server*, the local HTTP server that `myst start --headless` runs.

`packages/preview` (`@myst-author/preview`)
: Renders a MyST page with `myst-to-react`, from the [fast in-browser parse or mystmd's built page](../guide/preview.md#fast-and-built-previews).
  Each rendered block keeps its source line range, which is what click-to-source and scroll sync use.
  `@myst-author/preview/page` is a standalone preview page.
  The VS Code and JupyterLab previews show it.
  `@myst-author/preview/live` is a CodeMirror extension that renders each block in place in the editor.
  It shows the source of the block your cursor is in.
  Smaller entry points parse a page into blocks, control the preview page from an extension, and compile the preview's CSS.

`packages/lsp-client` (`@myst-author/lsp-client`)
: Connects the hosts to the language server.
  `@myst-author/lsp-client/spawn` starts a server process and relays its messages as strings.
  `@myst-author/lsp-client/client` is the CodeMirror client that talks to the language server, over a websocket or any message channel.
  Each host passes it a connection and a project root.

`packages/app` (`myst-author`)
: The web editor.
  A React app (CodeMirror editor, file list, preview) and a small Node server that hosts it.

`packages/vscode`
: The VS Code extension.
  It depends on the MyST Language Server extension (see [How the repositories fit together](repositories.md#what-each-one-owns)) and shows the same preview in a webview.
  Its live editor is a custom editor: a webview that runs CodeMirror with the same live preview.
  VS Code can't pass its language features into a webview, so the live editor's language client talks to a server process of its own.

`packages/jupyterlab` (`@myst-author/jupyterlab`)
: The JupyterLab extension.
  It connects Lab's Markdown editors and notebooks' Markdown cells to the language server through jupyter-lsp, which comes with JupyterLab.
  It adds live preview to them, and shows the preview page beside them.
  Notebook Markdown cells you aren't editing render with mystmd's build.

## How the web editor fits together

```{mermaid}
flowchart TB
  subgraph browser[Browser]
    editor["Editor<br/>CodeMirror + myst-syntax"]
    preview["Preview<br/>@myst-author/preview"]
  end
  subgraph host["Host server (packages/app/server)"]
    files["/api/files"]
    proxy["/myst proxy"]
    bridge["/lsp bridge"]
  end
  editor -- "read / autosave" --> files
  editor -- "LSP over websocket" --> bridge
  bridge -- stdio --> lsp["Language server<br/>mystmd-lsp"]
  preview -- "built pages, rebuild events" --> proxy
  proxy --> myst["myst start --headless"]
  lsp -- "built pages" --> myst
  files -- "writes .md" --> disk[(Project folder)]
  myst -- watches --> disk
```

1. The host server starts `myst start --headless` in the project folder.
2. The browser reads and saves `.md` files through `/api/files`.
3. mystmd notices the change and rebuilds.
   It sends a reload event over its websocket, which the host proxies at `/myst/socket`.
4. The preview fetches the rebuilt page JSON through `/myst` and shows it if it matches the editor text.
   Until then it shows the fast in-browser render.
5. On each reload event, the editor also re-reads the open file, to show changes made outside it, such as by an LLM or git.
   A save that would overwrite a change on disk is refused, and the editor asks whether to keep your edits or load the file.
6. Each browser connection to `/lsp` gets its own language server process, started with the project folder and mystmd's address.
   If the connection drops, the browser reconnects and re-opens its files.
   mystmd-lsp's [How it works](https://chrisholdgraf.com/mystmd-lsp/how-it-works) explains how the server uses mystmd.

The VS Code extension does the same without the host server.
The MyST Language Server extension owns the language server.
The server finds each file's project and starts one mystmd per project.
For each file, MyST Author sends the server a `myst/project` request.
The answer says which project the file belongs to and where that project's mystmd is.
MyST Author then fetches built pages from that mystmd directly.
Each VS Code live editor runs a language server of its own, and live editors in the same project share one mystmd.
The web editor starts the language server with `--root`, so the server uses that one project for every file instead of finding each file's project.

The JupyterLab extension works like VS Code.
jupyter-lsp runs the language server.
The extension sends the server a `myst/project` request for each file.
It then fetches that project's built pages from the project's mystmd through jupyter-server-proxy.
Lab reads and saves the files itself.
The host server only serves the web editor from the Launcher.

## Adding a host

Everything about MyST lives in the packages.
A host does only what depends on where it runs:

- It owns the document text.
- It runs a language server, with `spawnLsp` or a platform service such as jupyter-lsp.
  It connects the editor to that server through the LSP client.
- It fetches built pages from mystmd and passes each build of the open file to live preview with `offerBuilt`.
- It opens files and finds labels for the preview through `PreviewHost`.
- It adds its own commands and toggles.

## Design choices

- Each feature goes in the lowest layer that can hold it, as [Where a feature goes](repositories.md#where-a-feature-goes) describes.
  The web editor is the simplest host, not a full IDE.
  Features that VS Code and JupyterLab already have, such as git or file management, are left to them.
- The preview uses mystmd's own code.
  The fast preview uses mystmd's parser and transforms through mystmd-client, as the language server does.
  So the running system has no second parser.
  The built preview is mystmd's output.
  [myst-parser-unified](repositories.md#what-each-one-owns) is a separate experiment, not a dependency.
- Markdown is the source of truth.
  Changes go one way, from the Markdown to the preview.
- When an editing choice is open, do what [Obsidian](https://obsidian.md) does.
  Its live preview is the closest thing to what we want, and people already know it.
  For example, a click on a rendered link follows it instead of showing its source.
- Everything works with released mystmd.
  Changes that would make it better are written up as [upstream proposals](upstream.md).
