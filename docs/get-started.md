---
title: Get started
description: Run MyST Author locally, in GitHub Codespaces, or on Binder, and open your own project.
---

Run MyST Author on your computer, or open it in your browser with Codespaces or Binder.

## Run it locally

You need Node 24 or newer.
[mystmd](https://mystmd.org/guide/installing) (which provides the `myst` command) is recommended.

```bash
git clone https://github.com/choldgraf/myst-author
cd myst-author
npm install
npm run demo
```

`npm run demo` opens a copy of the tour project in a temporary folder, so your edits don't touch the repository.

The editor opens at <http://127.0.0.1:4321>.
Set `PORT` to use another port, for example `PORT=8000 npm run demo`.
On macOS it also opens a browser tab; set `NO_OPEN=1` to stop that.
If `myst` isn't on your `PATH`, set `MYST_BIN` to its location.

To run it from any folder as `myst-author`, run `npm link -w packages/app` once in the clone.
Then run `myst-author` in a project folder, or `myst-author path/to/project`.
It runs your clone, so a `git pull` updates it.

The editor still runs without mystmd, but it only knows about the open file.
References to labels in other files aren't completed or checked, and you only get the [fast preview](guide/preview.md).

## Open it in GitHub Codespaces

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/choldgraf/myst-author)

Codespaces installs everything, including the [VS Code extension](guide/vscode.md), and opens the tour project's first page.
To see the preview, run **MyST: Open Preview to the Side** from the Command Palette.

The web editor also runs on the tour project, on port 4321 (see the **Ports** tab).
To point it at another folder, stop it with {kbd}`Ctrl+C` in the terminal and run `npm start -- <path>`.

## Open it on Binder

[![Launch on Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/choldgraf/myst-author/main?urlpath=lab/tree/docs/examples/tour/index.md)

Binder builds the repository and opens the tour in JupyterLab, with the [JupyterLab extension](guide/jupyterlab.md).
The Launcher also has **VS Code**, with the [VS Code extension](guide/vscode.md), and **MyST Author**, the web editor.
Only the tour project gets the whole-project features.
The first launch can take a few minutes.
Changes are lost when the Binder session ends.

## Use your own project

Pass the folder that contains your `myst.yml`:

```bash
npm start -- path/to/your/project
```

MyST Author edits your files in place and saves as you type.
It runs `myst start --headless` in that folder to build the preview and find the labels in every file.
It edits `.md` files only.
Other files, such as notebooks and `.bib` files, are still used by the build.
