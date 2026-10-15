---
title: Architecture
description: The packages that make up MyST Author and how they talk to each other.
---

MyST Author is a set of small packages in one repository.
For how it fits with mystmd-lsp, myst-syntax and the other repositories, see [How the repositories fit together](repositories.md).
The editor features live in reusable packages, and each host (the web app, VS Code, JupyterLab) wires them together.

## Packages

The language server (mystmd-lsp) and the mystmd helpers (mystmd-client) live in their own repositories, as [What each one owns](repositories.md#what-each-one-owns) describes.
The packages here read built pages from mystmd's *content server*, the local HTTP server that `myst start --headless` runs.

`packages/preview` (`@myst-author/preview`)
: Renders a MyST page with `myst-to-react`, from the [fast in-browser parse or mystmd's built page](../guide/preview.md#fast-and-built-previews).
  Each rendered block keeps its source line range, which is what click-to-source and scroll sync use.
  `@myst-author/preview/parse` turns a page into blocks with source lines, from the fast parse or from a built page.
  Its `cellPages` splits a notebook's build into one page per cell.
  `@myst-author/preview/page` is the preview on its own page, which the VS Code and JupyterLab previews show.
  `@myst-author/preview/controller` runs in the extension and drives that page: it sends the current file and handles clicks.
  Its `findLabel` finds where a label is defined, through the language server's workspace symbols.
  `@myst-author/preview/live` is a CodeMirror extension that renders each block in place in the editor, and shows the source of the block with the cursor.
  Its `pageLook` extension makes the editor read like the page, as in the web app and the VS Code live editor.
  `@myst-author/preview/build` compiles the preview's CSS for hosts that bundle it.
  The VS Code and JupyterLab hosts implement the preview's `PreviewHost` interface to open files and look up labels.

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
  It connects Lab's Markdown editors and notebooks' Markdown cells to the host server's `/lsp` bridge.
  It adds live preview to them, and shows the preview page beside them.
  Notebook Markdown cells you aren't editing render with mystmd's build.

## How the web app fits together

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
   A save sends the hash of the text it replaces, and the host server refuses it if the file has changed on disk since.
   Either way, if you have unsaved edits, the editor asks whether to keep yours or load the file from disk.
6. Each browser connection to `/lsp` gets its own language server process, started with the project folder and mystmd's address.
   If the connection drops, the browser reconnects and re-opens its files.
   mystmd-lsp's [How it works](https://chrisholdgraf.com/mystmd-lsp/how-it-works) explains how the server uses mystmd.

The VS Code extension does the same without the host server.
The language server tells it which project each file belongs to and where that project's mystmd is, and it fetches built pages from there directly.
The web app and JupyterLab hosts start the language server with `--root`, so each of them is one project.

The JupyterLab extension uses the host server, which jupyter-server-proxy runs inside Jupyter.
Lab's editors connect to its `/lsp` bridge, and live preview and the preview panel fetch built pages through its `/myst` proxy.
Lab reads and saves the files itself, so it doesn't use `/api/files`.

## Adding a host

Everything about MyST lives in the packages.
A host does only what depends on where it runs:

- It holds the document: the editor's text, and edits to and from wherever it keeps that text (a file on disk, Lab's document model, or VS Code's `TextDocument`).
- It runs a language server.
  It starts one with `spawnLsp`, relays its messages to `connectLsp`, and gives the client a project root URI.
  `connectLsp` takes a websocket URL, or a `messageTransport` over any message channel.
- It fetches built pages with `contentServer`, and passes each build of the open file to live preview with `offerBuilt`, which shows it if it matches the editor text.
  For a notebook, it splits the build with `cellPages`, which leaves out cells changed since the build, and passes each remaining page to its cell's editor with `showBuilt`.
- It opens a file at a line, and finds a label.
  The preview pane asks for these through `PreviewHost`, and live preview follows links through `followLink`.
  The language client opens files through `workspace.displayFile`.
- It adds its own chrome: commands, toggles, and prompts in the host's own UI.

## Design choices

- Each feature goes in the lowest layer that can hold it, as [Where a feature goes](repositories.md#where-a-feature-goes) describes.
  The web app is the simplest host, not a full IDE.
  Features that VS Code and JupyterLab already have, such as git or file management, are left to them.
- The preview uses mystmd's own code.
  The fast preview uses mystmd's parser and transforms, through mystmd-client, as the language server does, so the running system has no second parser.
  The built preview is mystmd's output.
  [myst-parser-unified](repositories.md#what-each-one-owns) is a separate experiment, not a dependency.
- Markdown is the source of truth.
  Changes go one way, from the Markdown to the preview.
- Everything works with released mystmd.
  Changes that would make it better are written up as [upstream proposals](upstream.md).
