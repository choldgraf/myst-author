# MyST Author for VS Code

MyST in VS Code: language features from the [mystmd-lsp](https://github.com/choldgraf/mystmd-lsp) language server, MyST syntax highlighting, a live preview, and a live editor.

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

## What works

- The extension starts when you open a Markdown file or a notebook in a MyST project, the folder of the nearest `myst.yml` above it.
  It runs `myst start --headless` there, and uses that project for the rest of the window's session.
  Files outside a MyST project only get MyST syntax highlighting.
  Set `MYST_BIN` if `myst` isn't on your `PATH`.
- Without mystmd the extension still runs.
  The language server only knows the open files, and the preview only shows the fast render.
- Completion, hints, hover, go to definition, warnings, find references, rename, and workspace symbols for references and citations in Markdown files and notebooks' Markdown cells, and a page outline (Outline view, breadcrumbs, Cmd+Shift+O).
  See [mystmd-lsp's features](https://chrisholdgraf.com/mystmd-lsp/features/).
- To open the preview, run **MyST: Open Preview to the Side** from the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).
  The preview follows the active Markdown editor, but not notebooks.
  It shows mystmd's build when it matches the editor text (badge `built ✓`), and a fast in-browser render otherwise.
  - Scrolling the editor scrolls the preview.
  - Clicking a block reveals its source line.
  - Cmd-click (or Ctrl-click) a link to follow it.
    Web links open in the browser, and links to other pages open in the editor.
- To edit with live preview, click the book button in a Markdown file's toolbar, or run **MyST: Toggle Live Editor**.
  It's the web editor's live preview, with the same language features, on the same file: save and undo work as usual, and you can keep the text editor open beside it.
  Rename (F2), find references (Shift+F12), and go to definition in another file use VS Code's own commands, so they cover the whole project.
  VS Code's own editor features don't reach it: its outline and breadcrumbs, Copilot suggestions, and extensions such as Vim.
  Notebooks' Markdown cells don't get it.

## Notes

- MyST syntax is highlighted on top of VS Code's Markdown grammar.
  The [MyST-Markdown](https://marketplace.visualstudio.com/items?itemName=ExecutableBookProject.myst-highlight) extension highlights the same syntax, so turn one of them off.
- The extension turns off VS Code's own Markdown link suggestions (`markdown.suggest.paths.enabled`) in every Markdown file, since they suggest GitHub-style heading slugs that mystmd doesn't use for labeled headings.
  The language server completes files and labels instead.
- mystmd's and the language server's output go to the **MyST** output channel; **MyST: Show Log** opens it.
- **MyST: Open Built Site** shows the site `myst start` builds, with its theme, in VS Code's Simple Browser.
  It starts a second mystmd that serves the site, so the first run is slower while mystmd downloads its theme.
- To use your own build of the language server, set `mystAuthor.serverPath` to its script, such as `packages/mystmd-lsp/dist/server.cjs` in a mystmd-lsp clone, and reload the window.

## Develop

After changing any package, rebuild (`node build.mjs`) and reload the window (**Developer: Reload Window**).

- `build.mjs`: bundles the extension and the webviews with esbuild, and copies in mystmd-lsp's server bundle as `dist/lsp.js`.
  It also builds the webview CSS with Tailwind.
- `src/extension.ts`: starts mystmd (with `@myst-author/mystmd/start`) and the language client.
- `src/preview.ts`: the preview panel (extension side), which connects the editor to `@myst-author/preview/controller`.
- `src/webview.tsx`: the preview page (webview side), which is `@myst-author/preview/page`.
