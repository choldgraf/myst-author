# U9: Requests from the server in `@codemirror/lsp-client`

Code references are against `@codemirror/lsp-client` [6.3.0](https://github.com/codemirror/lsp-client/tree/6.3.0).

## Problem

`@codemirror/lsp-client` answers every request from the server with `MethodNotFound`, so a server can't ask the client to refresh, for example with `workspace/inlayHint/refresh` or `workspace/semanticTokens/refresh`.
So [`codemirror-lsp-inlay-hints`](https://github.com/choldgraf/codemirror-lsp-inlay-hints) has to guess when to ask for hints again.
MyST Author refreshes them after each `textDocument/publishDiagnostics`.

## Who benefits

- Any CodeMirror editor showing inlay hints: type hints, parameter names, or "Figure 1" after a MyST reference.
- Extensions that need to answer other server requests, such as `workspace/configuration`.

## Proposal

- `requestHandlers` on `LSPClientConfig` and `LSPClientExtension`, like `notificationHandlers`, whose return value is the response.
  `codemirror-lsp-inlay-hints` would then handle `workspace/inlayHint/refresh` and advertise `refreshSupport`, as its [issue #1](https://github.com/choldgraf/codemirror-lsp-inlay-hints/issues/1) describes.
  Inlay hints themselves [live outside lsp-client](https://code.haverbeke.berlin/codemirror/dev/issues/1772).

## Where in the code

- Requests from the server get `MethodNotFound`: [`src/client.ts:375-382`](https://github.com/codemirror/lsp-client/blob/6.3.0/src/client.ts#L375-L382).
- Notification handlers, the pattern to follow: [`src/client.ts:364-374`](https://github.com/codemirror/lsp-client/blob/6.3.0/src/client.ts#L364-L374).

## Size / risk

Small: a lookup like the notification one, and a response.
