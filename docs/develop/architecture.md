---
title: Architecture
description: The packages that make up MyST Author and how they talk to each other.
---

MyST Author is a set of small packages in one repository.
For how it fits with mystmd-lsp, myst-syntax and the other repositories, see [How the repositories fit together](repositories.md).
The editor features live in reusable packages, and each host (the web app, VS Code, JupyterLab) wires them together.

## Packages

`packages/mystmd` (`@myst-author/mystmd`)
: Starts and talks to mystmd.
  It has no React dependency, so the web app's host server (`packages/app/server`) and the extensions can use it as well as the preview.
  `@myst-author/mystmd/start` runs `myst start --headless`.
  `@myst-author/mystmd/built` reads built page JSON from mystmd's *content server*, the local HTTP server that `myst start --headless` runs.
  `@myst-author/mystmd/parse` parses a single page with mystmd's parser and transforms, and lists the directives and roles it knows.

`packages/preview` (`@myst-author/preview`)
: Renders a MyST page with `myst-to-react`, from the [fast in-browser parse or mystmd's built page](../guide/preview.md#fast-and-built-previews).
  Each rendered block keeps its source line range, which is what click-to-source and scroll sync use.
  `@myst-author/preview/page` is the preview on its own page, which the VS Code and JupyterLab previews show.
  `@myst-author/preview/controller` runs in the extension and drives that page: it sends the current file and handles clicks.
  `@myst-author/preview/live` is a CodeMirror extension that renders each block in place in the editor, and shows the source of the block with the cursor.
  Its `pageLook` extension makes the editor read like the page, as in the web app and the VS Code live editor.
  `@myst-author/preview/build` compiles the preview's CSS for hosts that bundle it.
  Each extension implements the preview's `PreviewHost` interface to open files and look up labels.

[`mystmd-lsp`](https://github.com/choldgraf/mystmd-lsp) (from npm)
: The language server for MyST references: completion, hover, go to definition, warnings, hints, and external references.
  It lives in its own repository and works in any LSP client; the hosts here are its editor integrations.
  Each host runs its bundle, `mystmd-lsp/dist/server.cjs`.
  [How the repositories fit together](repositories.md#what-each-one-owns) explains why the host starts mystmd for it.

`packages/lsp-client` (`@myst-author/lsp-client`)
: Connects the hosts to the language server.
  `@myst-author/lsp-client/spawn` starts a server process and relays its messages as strings.
  `@myst-author/lsp-client/client` is the CodeMirror client that talks to the language server, over a websocket or any message channel.
  Each host passes it a connection and a project root.
  `@myst-author/lsp-client/labels` finds where a label is defined, which hosts use to follow preview links.

`packages/app` (`myst-author`)
: The web editor.
  A React app (CodeMirror editor, file list, preview) and a small Node server that hosts it.

`packages/vscode`
: The VS Code extension.
  It runs the language server through VS Code's language client, adds a MyST grammar, and shows the same preview in a webview.
  Its live editor is a custom editor: a webview that runs CodeMirror with the same live preview.
  VS Code can't pass its language features into a webview, so the live editor's language client talks to a server process of its own.

`packages/jupyterlab` (`@myst-author/jupyterlab`)
: The JupyterLab extension.
  It connects Lab's Markdown editors and notebooks' Markdown cells to the host server's `/lsp` bridge.
  It adds live preview to them, and shows the preview page beside them.

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

The VS Code extension does the same without the host server: it starts `myst start --headless` and the language server itself, and fetches built pages from mystmd directly.

The JupyterLab extension uses the host server, which jupyter-server-proxy runs inside Jupyter.
Lab's editors connect to its `/lsp` bridge, and live preview and the preview panel fetch built pages through its `/myst` proxy.
Lab reads and saves the files itself, so it doesn't use `/api/files`.

## Adding a host

Everything about MyST lives in the packages; a host provides only what depends on where it runs:

- **The document.** The editor's text, and edits to and from wherever the host keeps it (a file on disk, Lab's document model, VS Code's `TextDocument`).
- **A language server.** Start one with `spawnLsp`, relay its messages to `connectLsp` (a websocket URL, or `messageTransport` over any message channel), and give the client a project root URI.
- **Built pages.** Fetch them with `contentServer`, and pass each build of the open file to live preview with `offerBuilt`, which shows it if it matches the editor text.
- **Opening a file at a line**, and finding a label, through `PreviewHost` for the preview and `workspace.displayFile` for the language client.
- **Its own chrome.** Commands, toggles, and prompts in the host's own UI.

## Design choices

- **Each feature goes in the lowest layer that can hold it.**
  See [Where a feature goes](repositories.md#where-a-feature-goes).
  The web app is the simplest host, not a full IDE: features that VS Code and JupyterLab already have, such as git or file management, are left to them.
- **The preview uses mystmd's own code.** The fast preview uses mystmd's parser and transforms.
  The built preview is mystmd's output.
  There is no separate MyST parser to keep in sync.
- **Markdown is the source of truth.** Changes go one way, from the Markdown to the preview.
- **Stock mystmd.** Everything works with released mystmd.
  Changes that would make it better are written up as [upstream proposals](upstream.md).
