# MyST Author for JupyterLab

Cross-reference help and live preview for Markdown in JupyterLab's editor.
It uses Lab's own file browser and editor.

## How it works

The extension is a frontend only.
It talks to the MyST Author server (`packages/app/server`), which runs mystmd and the language server for one project.
[jupyter-server-proxy](https://jupyter-server-proxy.readthedocs.io) runs that server at `<jupyter>/myst-author/`.
See [`binder/jupyter_server_config.py`](https://github.com/choldgraf/myst-author/blob/main/binder/jupyter_server_config.py) for the setup; `MYST_AUTHOR_PROJECT` sets the project folder.

## Try it

You need JupyterLab 4.5 or newer, jupyter-server-proxy, and Node 24.
From the repo root:

```sh
npm install
npm run lab                        # the tour
npm run lab -- path/to/project     # or your own MyST project
```

`npm run lab` builds the server and the extension, then starts JupyterLab in the project folder with both.
It loads the extension from `packages/jupyterlab/dist/`, so your own JupyterLab setup doesn't change.
Options after the project go to `jupyter lab`, for example `npm run lab -- . --port 9000`.
Run it again after changes.

## Install it in your own JupyterLab

```sh
npm install                            # from the repo root
npm run build                          # the web editor, for the MyST Author launcher
npm run build -w packages/jupyterlab   # writes packages/jupyterlab/dist/labextension
mkdir -p "$(jupyter --data-dir)/labextensions/@myst-author"
ln -sfn "$PWD/packages/jupyterlab/dist/labextension" "$(jupyter --data-dir)/labextensions/@myst-author/jupyterlab"
```

`jupyter labextension list` should show `@myst-author/jupyterlab`.
Then add [`binder/jupyter_server_config.py`](https://github.com/choldgraf/myst-author/blob/main/binder/jupyter_server_config.py) to your Jupyter config, and set `MYST_AUTHOR_PROJECT` to your project folder.
Rebuild and reload the page after changes.

## What works

- Completion, hints, hover, go to definition, and warnings for references in Markdown files and notebooks' Markdown cells, as in the web editor.
- Live preview in Markdown files, and in notebooks' Markdown cells while you edit them, as in the web editor.
  Turn it on or off with **MyST: Live Preview** in the Command Palette.
  The preview panel only follows Markdown files.
- To open the preview, right-click in a Markdown editor and pick **MyST: Open Preview to the Side**, or find it in the Command Palette.
  It follows the current Markdown editor, scrolls with it, and clicking a block reveals its source line.
  Cmd-click (or Ctrl-click) a link to follow it.
- Files outside the server's project folder get the fast preview and open-file references only.
- The language features need jupyter-lsp, which ships with JupyterLab.
  Without it, the extension logs a warning in the browser console, and only the preview works.

## Develop

- `build.mjs`: compiles `src/` with esbuild, then bundles it with `@jupyterlab/builder`.
  JupyterLab and CodeMirror packages stay external, so the extension uses Lab's copies.
- `src/index.ts`: attaches live preview (`@myst-author/preview/live`) and the language client (`@myst-author/lsp-client/client`) to Markdown editors, and adds the preview panel (`@myst-author/preview/controller`).
  Live blocks and the preview panel render in shadow roots with the preview's CSS, which `build.mjs` compiles to `dist/live.css`, so it can't restyle Lab.
  `style/index.css` loads KaTeX's CSS into the page for its fonts, since shadow roots ignore `@font-face`.
  The preview panel is the same page as the VS Code preview (`@myst-author/preview/page`).
