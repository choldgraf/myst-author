# MyST Author for VS Code

MyST in VS Code: a live preview and a live editor on top of the [MyST Language Server](https://github.com/choldgraf/mystmd-lsp/tree/main/packages/vscode) extension.
It depends on that extension, which depends on [MyST Syntax](https://github.com/choldgraf/myst-syntax) for highlighting, so once they are published one install gives all three.
Until then, you build and load it from this repository.

## Build and run

You need the `code` command on your `PATH`.
On macOS, run **Shell Command: Install 'code' command in PATH** from the VS Code Command Palette.

```sh
npm install                      # from the repo root
cd packages/vscode
node build.mjs                   # writes dist/
code --extensionDevelopmentPath="$PWD" /path/to/a/myst/project
```

`--extensionDevelopmentPath` loads the extension in that window only.
It doesn't install it.

To install it (in VS Code, Codespaces, or code-server), package it and install the `.vsix`:

```sh
npm run package -w packages/vscode   # from the repo root, writes packages/vscode/myst-author.vsix
code --install-extension packages/vscode/myst-author.vsix
```

`npm run vscode` from the repo root packages and installs it, replacing any copy you installed before.
Reload open VS Code windows afterwards.

Until MyST Language Server and MyST Syntax are published, install them first, as [Develop](https://github.com/choldgraf/myst-author/tree/main/packages/vscode#develop) says.

`npm run demo:vscode` instead opens a fresh copy of the tour in a separate VS Code, with its own settings and the extensions this one depends on.
Choose **Trust** when VS Code asks, since it doesn't run the extension in Restricted Mode.

## What works

- The extension starts when a workspace folder contains a `myst.yml`.
  The language server [finds each file's project](https://chrisholdgraf.com/mystmd-lsp/configuration#finding-the-project) and runs `myst start --headless` there, so several projects can be open in one window.
  Without mystmd, or for a file no project builds, there's no preview and the live editor has no language features.
  Set `MYST_BIN` if `myst` isn't on your `PATH`.
- [mystmd-lsp's features](https://chrisholdgraf.com/mystmd-lsp/features) work in Markdown files and notebooks' Markdown cells.
  The page outline shows in the Outline view and the breadcrumbs, and `Cmd+Shift+O` searches it.
- To open the preview, run **MyST: Open Preview to the Side** from the Command Palette.
  It follows the active Markdown text editor and works as [Preview](https://chrisholdgraf.com/myst-author/guide/preview) describes.
- To edit with live preview, click the book button in a Markdown file's toolbar, or run **MyST: Toggle Live Editor**.
  It edits the same file as the text editor, so save and undo work as usual and you can keep both open.
  Rename, find references, and go to definition use VS Code's own commands, so they work across the project.
  VS Code's own editor features, such as the outline, Copilot, and Vim, don't reach it, and notebooks' Markdown cells don't get it.

## Notes

- mystmd's and the language server's output go to the MyST Language Server extension's output channel.
- To use your own build of the language server, set its `mystmdLsp.serverPath` setting.

## Develop

After changing any package, rebuild (`node build.mjs`) and reload the window (**Developer: Reload Window**).

Until MyST Language Server and MyST Syntax are published, VS Code won't activate this extension without their `.vsix` files installed, even with `--extensionDevelopmentPath`.
`node packages/vscode/deps.mjs` builds both into `packages/vscode/deps/`, and `code --install-extension` installs each.

The comments in `build.mjs` explain how the extension and its webviews are built.

[Architecture](../../docs/develop/architecture.md#packages) describes the extension and the packages it uses.
