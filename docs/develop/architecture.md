---
title: Architecture
description: The packages that make up MyST Author and how they talk to each other.
---

MyST Author is a set of small packages in one repository.
The editor features live in reusable packages, and each host (the web app, VS Code) wires them together.

## Packages

`packages/preview` (`@myst-author/preview`)
: Parses a MyST page in the browser with mystmd's parser and transforms, and renders it with `myst-to-react`.
  Also loads mystmd's built page JSON for the built preview.
  Each rendered block keeps its source line range, which is what click-to-source and scroll sync use.

`packages/lsp` (`@myst-author/lsp`)
: A language server for MyST references: completion, hover, go to definition, warnings, hints, and external references.
  It indexes mystmd's built pages plus the unsaved text of open files.
  It reads them from the *content server*, the local HTTP server that `myst start --headless` runs to serve built page JSON.
  See its [README](https://github.com/choldgraf/myst-author/tree/main/packages/lsp).

`packages/codemirror-lang-myst`
: MyST syntax highlighting for CodeMirror 6, on top of the Markdown mode.

`packages/app` (`myst-author`)
: The web editor.
  A React app (CodeMirror editor, file list, preview) and a small Node server that hosts it.

`packages/vscode`
: The VS Code extension.
  It runs the same language server and shows the same preview in a webview.

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
   The host adds the project folder and mystmd's address to the client's `initialize` message.
   It holds that `initialize` message until mystmd is ready or has failed to start.
   The server reloads its index on each rebuild.

The VS Code extension does the same without the host server: it starts `myst start --headless` and the language server itself, and fetches built pages from mystmd directly.

## Design choices

- **The preview uses mystmd's own code.** The fast preview uses mystmd's parser and transforms.
  The built preview is mystmd's output.
  There is no separate MyST parser to keep in sync.
- **Markdown is the source of truth.** Changes go one way, from the Markdown to the preview.
- **Reuse mystmd's index.** The language server reads mystmd's built pages instead of building its own index of the project.
- **Stock mystmd.** Everything works with released mystmd.
  Changes that would make it better are written up as [upstream proposals](upstream.md).
