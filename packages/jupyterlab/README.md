# MyST Author for JupyterLab

Cross-reference help and live preview for Markdown files and notebooks in JupyterLab.
It uses Lab's own file browser and editor.
Install it from source, as below, or try it on [Binder](https://chrisholdgraf.com/myst-author/get-started#open-it-on-binder).

## How it works

The extension is a frontend only.
It talks to [mystmd-lsp](https://github.com/choldgraf/mystmd-lsp) through jupyter-lsp, which comes with JupyterLab and runs the language server over a websocket.
The language server finds each file's project by looking for the nearest `myst.yml` under Jupyter's root folder.
Then it runs mystmd for that project.
So you can start Lab in your home folder.
Completions, the preview and the table of contents switch to the project of the file you're editing.
The browser talks to each project's mystmd through [jupyter-server-proxy](https://jupyter-server-proxy.readthedocs.io).
See [`binder/jupyter_server_config.py`](https://github.com/choldgraf/myst-author/blob/main/binder/jupyter_server_config.py) for the setup.

## Try it

You need Node 24 and [uv](https://docs.astral.sh/uv/).
You also need JupyterLab installed in your `python`, so the build can see Lab's shared packages.
Lab itself runs through `uvx`, not from that install.
From the repo root:

```sh
npm install
npm run demo:lab                   # a copy of the tour
npm run lab -- path/to/project     # or your own MyST project
```

`npm run lab` builds the web editor and the extension, then starts JupyterLab in the project folder with both.
JupyterLab and jupyter-server-proxy run in a throwaway `uvx` environment.
That environment's Jupyter config and extensions are in `packages/jupyterlab/dist/jupyter/`.
Your own Jupyter setup doesn't change, and extensions you've installed, such as jupyterlab-myst, don't load.
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
Then install jupyter-server-proxy, and add [`binder/jupyter_server_config.py`](https://github.com/choldgraf/myst-author/blob/main/binder/jupyter_server_config.py) to your Jupyter config.
That config adds a **MyST Author** entry to the Launcher.
That entry opens the web editor on the folder in `MYST_AUTHOR_PROJECT`, or on the tour if that isn't set.
Jupyter needs `myst` on its `PATH`, so [install mystmd](https://mystmd.org/guide/installing) or set `MYST_BIN`.
Rebuild and reload the page after changes.

## What works

- Reference help works in Markdown files and notebooks' Markdown cells, as in the web editor.
  That covers completion, hints, hover, go to definition, find references, rename, and warnings.
  Use one browser tab at a time.
  jupyter-lsp runs one language server and sends its answers to every open tab, so two tabs confuse each other.
- Live preview in Markdown files, and in notebooks' Markdown cells while you edit them, as in the web editor.
  Turn it on or off with **MyST: Live Preview** in the Command Palette.
- Notebooks' Markdown cells that you aren't editing render with mystmd's build, so references to other pages resolve.
  A cell you've changed since saving shows the fast preview until the next build.
  If jupyterlab-myst is also installed, Lab renders the cell with it first.
  You may see that flash before MyST Author's rendering.
- For MyST syntax highlighting while editing, install [jupyterlab-myst-syntax](https://github.com/choldgraf/myst-syntax).
  Until it is published, build it from that repository.
  The throwaway environments that `npm run lab` and Binder use don't include it yet.
  MyST Author's Lab extension doesn't highlight, by design, so the two don't overlap.
- To open the preview, right-click in a Markdown editor and pick **MyST: Open Preview to the Side**, or find it in the Command Palette.
  It shows the file in the current Markdown editor, but not notebooks.
  It works as [Preview](https://chrisholdgraf.com/myst-author/guide/preview) describes.
- Files mystmd doesn't build get live preview in the editor, but no side preview and no reference help.
  That includes files with no `myst.yml` above them under Jupyter's root folder.
  When you switch to one of those files, the side preview keeps showing the last page it showed.
- The language features need jupyter-lsp, which ships with JupyterLab.
  Without it, the extension logs a warning in the browser console, and only the preview works.

## Develop

The comments in `build.mjs` and `src/index.ts` explain how the extension is built and how it renders inside Lab.
