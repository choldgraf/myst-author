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
npm run package -w packages/vscode   # from the repo root; writes packages/vscode/myst-author.vsix
code --install-extension packages/vscode/myst-author.vsix
```

`npm run vscode` from the repo root does both, replacing any copy you installed before.
Reload open VS Code windows afterwards.

Until MyST Language Server and MyST Syntax are published, install their `.vsix` files first, since VS Code resolves extension dependencies from its gallery and won't activate this extension without them.
`node packages/vscode/deps.mjs` builds both into `packages/vscode/deps/`; install each with `code --install-extension`.
`--extensionDevelopmentPath` needs them installed in your VS Code too; `npm run demo:vscode` installs them itself.

`npm run demo:vscode` instead opens a fresh copy of the tour.
It opens in a separate VS Code with its own settings and extensions, so your own setup doesn't change and extensions you've installed don't load.
The copy goes in the same folder each time, so VS Code only asks once whether you trust it.
Choose **Trust**, since VS Code doesn't run the extension in Restricted Mode.
The tour opens Markdown files in the live editor.

## What works

- The extension starts when a workspace folder contains a `myst.yml`.
  The language server [picks each file's project](https://chrisholdgraf.com/mystmd-lsp/configuration#finding-the-project), the nearest `myst.yml` at or above the file within its workspace folder, and runs `myst start --headless` there.
  The preview and the live editor show a file through its project, so a file that isn't a page of one gets no preview.
  The MyST Language Server extension's status bar item says which project a file belongs to.
  Set `MYST_BIN` if `myst` isn't on your `PATH`.
- Without mystmd the text editor keeps the language server's features for open files, but the preview and the live editor's language features need mystmd.
- [mystmd-lsp's features](https://chrisholdgraf.com/mystmd-lsp/features) work in Markdown files and notebooks' Markdown cells.
  The page outline shows in the Outline view and the breadcrumbs, and `Cmd+Shift+O` searches it.
- To open the preview, run **MyST: Open Preview to the Side** from the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).
  The preview follows the active Markdown text editor, not the live editor or notebooks, and stays on the last page when you switch to a file that isn't one.
  It works as [Preview](https://chrisholdgraf.com/myst-author/guide/preview) describes.
- To edit with live preview, click the book button in a Markdown file's toolbar, or run **MyST: Toggle Live Editor**.
  It's the web editor's live preview, with the same language features.
  It edits the same file as the text editor, so save and undo work as usual and you can keep both open.
  Rename (F2), find references (Shift+F12), and go to definition in another file use VS Code's own commands, so they work across the project.
  VS Code's own editor features don't reach it: its outline and breadcrumbs, Copilot suggestions, and extensions such as Vim.
  Notebooks' Markdown cells don't get it.

## Notes

- mystmd's and the language server's output go to the MyST Language Server extension's output channel.
- To use your own build of the language server, set its `mystmdLsp.serverPath` setting.

## Develop

After changing any package, rebuild (`node build.mjs`) and reload the window (**Developer: Reload Window**).

The comments in `build.mjs` explain how the extension and its webviews are built.

[Architecture](../../docs/develop/architecture.md#packages) describes the extension and the packages it uses.
