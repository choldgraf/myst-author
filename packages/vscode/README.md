# MyST Author for VS Code

Cross-reference help (from `@myst-author/lsp`) and a live preview (from `@myst-author/preview`) inside VS Code.

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

## What works

- The extension starts when you open a Markdown file.
  Its project is the folder of the nearest `myst.yml` above that file, and it runs `myst start --headless` there.
  Set `MYST_BIN` if `myst` isn't on your `PATH`.
- Without mystmd the extension still runs.
  The language server only knows the open files, and the preview only shows the fast render.
- Completion, hints, hover, go to definition, warnings, and workspace symbols for references in Markdown files.
  See the [LSP README](https://github.com/choldgraf/myst-author/tree/main/packages/lsp).
- To open the preview, run **MyST: Open Preview to the Side** from the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).
  The preview follows the active Markdown editor.
  It shows mystmd's build when it matches the editor text (badge `built ✓`), and a fast in-browser render otherwise.
  - Scrolling the editor scrolls the preview.
  - Clicking a block reveals its source line.
  - Cmd-click (or Ctrl-click) a link to follow it.
    Web links open in the browser, and links to other pages open in the editor.

## Notes

- Syntax highlighting is VS Code's built-in Markdown grammar.
  Install the [MyST-Markdown](https://marketplace.visualstudio.com/items?itemName=ExecutableBookProject.myst-highlight) extension for MyST highlighting.
- mystmd's output goes to the extension host console (**Help → Toggle Developer Tools**).
- The language server logs to the **MyST Author** output channel.

## Develop

After changing any package, rebuild (`node build.mjs`) and reload the window (**Developer: Reload Window**).

- `build.mjs`: bundles the extension, the language server, and the webview with esbuild.
  It also builds the webview CSS with Tailwind.
- `src/extension.ts`: starts mystmd and the language client.
- `src/preview.ts`: the preview panel (extension side).
- `src/webview.tsx`: the preview page (webview side), which is `@myst-author/preview/page`.
