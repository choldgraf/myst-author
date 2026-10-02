# @myst-author/lsp-client

Connects the web app, JupyterLab, and VS Code to the [`mystmd-lsp`](https://github.com/choldgraf/mystmd-lsp) language server.

- `src/client/` (`@myst-author/lsp-client/client`): `connectLsp`, a `@codemirror/lsp-client` with inlay hints and Cmd/Ctrl-click to go to definition.
  The host passes it a websocket URL or a `messageTransport`, and the root for document URIs.
- `src/labels.ts` (`@myst-author/lsp-client/labels`): `findLabel`, which finds a label's definition through any LSP client's `workspace/symbol` request.
  Hosts use it to follow preview `#label` links.
- `src/args.ts` (`@myst-author/lsp-client/args`): the arguments hosts start the server with.
- `src/spawn.ts` (`@myst-author/lsp-client/spawn`): `spawnLsp`, which starts the server from Node and relays its messages as strings.
