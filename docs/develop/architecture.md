---
title: Architecture
description: The packages that make up MyST Author and how they talk to each other.
---

MyST Author is a set of small packages in one repository.
The editor features live in reusable packages, and each host (the web app, VS Code, JupyterLab) wires them together.

## Packages

`packages/preview` (`@myst-author/preview`)
: Parses a MyST page in the browser with mystmd's parser and transforms, and renders it with `myst-to-react`.
  Also loads mystmd's built page JSON for the built preview.
  Each rendered block keeps its source line range, which is what click-to-source and scroll sync use.
  `@myst-author/preview/page` is the preview on its own page, which the VS Code and JupyterLab previews embed.
  `@myst-author/preview/controller` is their host side: it sends the page the current file and answers its clicks.
  Each extension gives it a small adapter to open files and look up labels.

`packages/lsp` (`@myst-author/lsp`)
: A language server for MyST references: completion, hover, go to definition, warnings, hints, and external references.
  It indexes mystmd's built pages plus the unsaved text of open files.
  It reads them from the *content server*, the local HTTP server that `myst start --headless` runs to serve built page JSON.
  It also has the browser client for it (`@myst-author/lsp/client`), used by the web app and JupyterLab, and the launcher for `myst start --headless` (`@myst-author/lsp/myst`).
  See its [README](https://github.com/choldgraf/myst-author/tree/main/packages/lsp).

`packages/codemirror-lang-myst`
: MyST syntax highlighting for CodeMirror 6, on top of the Markdown mode.

`packages/app` (`myst-author`)
: The web editor.
  A React app (CodeMirror editor, file list, preview) and a small Node server that hosts it.

`packages/vscode`
: The VS Code extension.
  It runs the same language server and shows the same preview in a webview.

`packages/jupyterlab` (`@myst-author/jupyterlab`)
: The JupyterLab extension.
  It connects Lab's Markdown editors to the host server's language server and shows the server's preview page beside them.

## How the web app fits together

```{mermaid}
flowchart TB
  subgraph browser[Browser]
    editor["Editor<br/>CodeMirror + codemirror-lang-myst"]
    preview["Preview<br/>@myst-author/preview"]
  end
  subgraph host["Host server (packages/app/server)"]
    files["/api/files"]
    proxy["/myst proxy"]
    bridge["/lsp bridge"]
  end
  editor -- "read / autosave" --> files
  editor -- "LSP over websocket" --> bridge
  bridge -- stdio --> lsp["Language server<br/>@myst-author/lsp"]
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
5. Each browser connection to `/lsp` gets its own language server process.
   In production it runs the bundle from `npm run build`, which starts faster than the TypeScript source.
   If the connection drops, the browser reconnects and re-opens its files.
   The host starts it with the project folder and mystmd's address as arguments.
   The host picks mystmd's port when it starts it, so the address is known before the first build.
   The server loads the project once mystmd is up, and reloads its index on each rebuild.

The VS Code extension does the same without the host server: it starts `myst start --headless` and the language server itself, and fetches built pages from mystmd directly.

The JupyterLab extension uses the host server, which jupyter-server-proxy runs inside Jupyter.
Lab's editors connect to its `/lsp` bridge, and the preview panel is an iframe of its `preview.html`.
Lab reads and saves the files itself, so it doesn't use `/api/files`.

## Design choices

- **The preview uses mystmd's own code.** The fast preview uses mystmd's parser and transforms.
  The built preview is mystmd's output.
  There is no separate MyST parser to keep in sync.
- **Markdown is the source of truth.** Changes go one way, from the Markdown to the preview.
- **Reuse mystmd's index.** The language server reads mystmd's built pages instead of building its own index of the project.
- **Stock mystmd.** Everything works with released mystmd.
  Changes that would make it better are written up as [upstream proposals](upstream.md).
