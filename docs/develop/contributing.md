---
title: Contributing
description: The repository layout, running the tests and docs, running each host, recording the demo videos, and publishing the VS Code extension.
---

## Repository layout

The packages live in `packages/`, and [Architecture](architecture.md#packages) describes each one.
The other top-level folders are:

- `docs/`: this documentation site.
- `docs/examples/tour/`: the example project used by the tour, Codespaces, and Binder.
- `upstream/`: proposals for the projects MyST Author builds on.
- `.devcontainer/`: the GitHub Codespaces config.
- `binder/`: the Binder config.

The packages are [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) written in TypeScript.
Node 24 strips the types and runs them directly.
Only the web editor and the VS Code and JupyterLab extensions have a build step, because they're bundled.

## Set up

```bash
npm install
```

## Run the tests

```bash
npm test
npm run typecheck
```

`npm test` runs each package's tests with `node --test`.
`npm run typecheck` checks the types of every package with `tsc`, using the root `tsconfig.json`.
CI runs both, and builds the web editor and the VS Code and JupyterLab extensions.

## Run each host

The web editor, with the development server:

```bash
npm run demo
```

`npm run demo` runs on a temporary copy of the tour, because the editor saves as you type and would otherwise edit the repo.
`npm start -- path/to/project` runs the web editor on any project.
The development server uses Vite, so changes to the app reload in the browser as you save them.

The production build:

```bash
npm run build
npm run serve -- path/to/project
```

On Binder, the **MyST Author** Launcher entry runs the production build.
[`binder/jupyter_server_config.py`](https://github.com/choldgraf/myst-author/blob/main/binder/jupyter_server_config.py) adds that entry.

To run the VS Code extension, see [VS Code](../guide/vscode.md).
To rebuild it after changes, see the [Develop section of its README](https://github.com/choldgraf/myst-author/tree/main/packages/vscode#develop).

The JupyterLab extension, built and running in JupyterLab (see [JupyterLab](../guide/jupyterlab.md)):

```bash
npm run demo:lab
```

## The docs

The docs are a MyST site in `docs/`.
Preview them while you edit, or build the HTML site:

```bash
npm run docs:live
npm run docs
```

Pages use `{include}` to pull in the package READMEs where they can, so update the README rather than copying text into a docs page.
The tour project in `docs/examples/tour/` is a separate MyST project, not part of the docs site.

## Record the demo videos

The demo videos in the docs are attachments on [issue #7](https://github.com/choldgraf/myst-author/issues/7), not files in git.
mystmd can't show a remote video in a figure yet ([mystmd#3100](https://github.com/jupyter-book/mystmd/issues/3100)).
So `npm run docs` and `npm run docs:live` first run `npm run docs:videos`, which downloads them into `docs/videos/`.
It skips any video that's already there, so delete a video to download the published one again.
The video URLs are in `docs/videos/download.mjs`.

Record a video again when a feature in it looks different.
The videos are recorded with [shot-scraper](https://shot-scraper.datasette.io/en/stable/video.html).
Each video has a storyboard next to it in `docs/videos/`, a YAML file that lists the clicks and typing to record.
Each storyboard starts its editor on a fresh copy of the tour.
Run the storyboards from the repository root:

```bash
uvx shot-scraper video docs/videos/web-editor.yml --mp4 --timeout 120000  # the web editor
uvx shot-scraper video docs/videos/jupyterlab.yml --mp4 --timeout 120000  # JupyterLab
uvx shot-scraper video docs/videos/vscode.yml --mp4 --timeout 120000      # VS Code, in code-server
```

The JupyterLab storyboard needs the built extension, so run `npm run demo:lab` once before it.
The storyboards use ports 4400, 9100 and 9200, and put their copies of the tour under `/tmp/myst-author-video-*`.
If a recording stops partway, its editor may keep running, so stop it with `pkill -f /tmp/myst-author-` before you try again.
Each storyboard writes a WebM and an MP4 into `docs/videos/`, such as `vscode.webm` and `vscode.mp4`.
The docs build shows the new MP4 right away, because `npm run docs:videos` doesn't replace it.
To publish it, drag the new MP4 into a comment on issue #7.
Then replace that video's old URL in `docs/videos/download.mjs` with the new attachment's URL.
The comments in each storyboard explain its workarounds, such as moving the cursor to the caret after a click.

## Publish the VS Code extension

Publish it to both the Marketplace and Open VSX, which code-server uses.
Publish the extensions it depends on first: myst-syntax, then mystmd-lsp.
Extension dependencies have no version pin, so the Marketplace and Open VSX must already have them.
