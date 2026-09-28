# MyST Author for JupyterLab

Cross-reference help and a live preview for Markdown files in JupyterLab's editor.
It uses Lab's own file browser and editor.

## How it works

The extension is a frontend only.
It talks to the MyST Author server (`packages/app/server`), which runs mystmd and the language server for one project.
[jupyter-server-proxy](https://jupyter-server-proxy.readthedocs.io) runs that server at `<jupyter>/myst-author/`.
See [`binder/jupyter_server_config.py`](https://github.com/choldgraf/myst-author/blob/main/binder/jupyter_server_config.py) for the setup, and change its project folder to use your own project.

## Build and install

You need JupyterLab 4.5 or newer, jupyter-server-proxy, and Node 24.

```sh
npm install                            # from the repo root
npm run build                          # the server's pages, including the preview
npm run build -w packages/jupyterlab   # writes packages/jupyterlab/dist/labextension
mkdir -p "$(jupyter --data-dir)/labextensions/@myst-author"
ln -sfn "$PWD/packages/jupyterlab/dist/labextension" "$(jupyter --data-dir)/labextensions/@myst-author/jupyterlab"
```

`jupyter labextension list` should show `@myst-author/jupyterlab`.
Rebuild and reload the page after changes.

## What works

- Completion, hints, hover, go to definition, and warnings for references in Markdown files, as in the web editor.
- To open the preview, right-click in a Markdown editor and pick **MyST: Open Preview to the Side**, or find it in the Command Palette.
  It follows the current Markdown editor, scrolls with it, and clicking a block reveals its source line.
  Cmd-click (or Ctrl-click) a link to follow it.
- Files outside the server's project folder get the fast preview and open-file references only.
- The language features need jupyter-lsp, which ships with JupyterLab.
  Without it, the extension logs a warning in the browser console, and only the preview works.

## Develop

- `build.mjs`: compiles `src/` with esbuild, then bundles it with `@jupyterlab/builder`.
  JupyterLab and CodeMirror packages stay external, so the extension uses Lab's copies.
- `src/index.ts`: attaches the language client (`@myst-author/lsp/client`) to Markdown editors and adds the preview panel (`@myst-author/preview/controller`).
  The preview panel is an iframe of the server's `preview.html`, the same page as the VS Code preview (`@myst-author/preview/page`).
