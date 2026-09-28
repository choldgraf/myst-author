---
title: Contributing
description: The repository layout, running the tests and docs, and running each host.
---

## Repository layout

The packages live in `packages/`, and [Architecture](architecture.md#packages) describes each one.
The other top-level folders are:

- `docs/`: this documentation site.
- `docs/examples/tour/`: the example project used by the tour, Codespaces, and Binder.
- `upstream/`: proposals for mystmd and myst-theme.
- `.devcontainer/`: the GitHub Codespaces config.
- `binder/`: the Binder config.

The packages are [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) written in TypeScript.
Node 24 strips the types and runs them directly.
Only the browser bundle and the VS Code extension have a build step.

## Set up

```bash
npm install
```

## Run the tests

```bash
npm test
```

This runs each package's tests with `node --test`.

## Run each host

The web editor, with the development server:

```bash
npm start -- docs/examples/tour
```

This is the normal way to run it locally.
It uses Vite, so changes to the app reload in the browser as you save them.

The web editor, as a production build (what Binder and JupyterHub setups run):

```bash
npm run build
npm run serve -- docs/examples/tour
```

The VS Code extension: see [VS Code](../guide/vscode.md) to run it, and the [Develop section of its README](https://github.com/choldgraf/myst-author/tree/main/packages/vscode#develop) for rebuilding after changes.

The language server on its own, for any LSP client:

```bash
node packages/lsp/src/server.ts --stdio
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
