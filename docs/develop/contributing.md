---
title: Contributing
description: The repository layout, running the tests and docs, and running each host.
---

## Repository layout

The packages live in `packages/`, and [Architecture](architecture.md#packages) describes each one.
The other top-level folders are:

- `docs/`: this documentation site.
- `docs/examples/tour/`: the example project used by the tour, Codespaces, and Binder.
- `upstream/`: proposals for the projects MyST Author builds on, ranked.
- `.devcontainer/`: the GitHub Codespaces config.
- `binder/`: the Binder config.

The packages are [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) written in TypeScript.
Node 24 strips the types and runs them directly.
Only the bundles have a build step: the web app, and the VS Code and JupyterLab extensions.
The web app and JupyterLab get the language server already bundled, from the [`mystmd-lsp`](https://github.com/choldgraf/mystmd-lsp) npm package; VS Code gets it from the MyST Language Server extension.

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
CI runs both, and builds the web app and the VS Code and JupyterLab extensions.

## Run each host

The web editor, with the development server:

```bash
npm run demo
```

This is the normal way to run it locally.
It runs on a temporary copy of the tour, because the editor saves as you type and would otherwise edit the repo.
`npm start -- path/to/project` runs it on any project.
It uses Vite, so changes to the app reload in the browser as you save them.

The web editor, as a production build, which Binder and the JupyterLab extension run through [`binder/jupyter_server_config.py`](https://github.com/choldgraf/myst-author/blob/main/binder/jupyter_server_config.py):

```bash
npm run build
npm run serve -- path/to/project
```

The VS Code extension: see [VS Code](../guide/vscode.md) to run it, and the [Develop section of its README](https://github.com/choldgraf/myst-author/tree/main/packages/vscode#develop) for rebuilding after changes.

The JupyterLab extension, built and running in JupyterLab (see [JupyterLab](../guide/jupyterlab.md)):

```bash
npm run demo:lab
```

## The docs

The docs are a MyST site in `docs/`.
Preview them while you edit, or build the HTML site:

```bash
npm run docs:live
npm run build:docs
```

Pages use `{include}` to pull in the package READMEs where they can, so update the README rather than copying text into a docs page.
The tour project in `docs/examples/tour/` is a separate MyST project, not part of the docs site.
