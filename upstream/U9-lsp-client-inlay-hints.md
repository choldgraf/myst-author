# U9: Inlay hints and server requests in `@codemirror/lsp-client`

Code references are against `@codemirror/lsp-client` [6.3.0](https://github.com/codemirror/lsp-client/tree/6.3.0).

## Problem

`@codemirror/lsp-client` has no inlay hints.
It also answers every request from the server with `MethodNotFound`, so a server can't ask the client to refresh, for example with `workspace/inlayHint/refresh` or `workspace/semanticTokens/refresh`.
A client that wants inlay hints must add them itself, and guess when to ask for them again.

## Who benefits

- Any CodeMirror editor talking to a language server that sends inlay hints: type hints, parameter names, or "Figure 1" after a MyST reference.
- Extensions that need to answer other server requests, such as `workspace/configuration`.

## Proposal

- An `inlayHints()` extension that requests `textDocument/inlayHint` for the document and shows each hint as a widget.
  MyST Author's [`packages/lsp-client/src/client/inlayHints.ts`](../packages/lsp-client/src/client/inlayHints.ts) is about 50 lines and could be a starting point.
  It refreshes after each `textDocument/publishDiagnostics`, since the client can't receive `workspace/inlayHint/refresh`.
- `requestHandlers` on `LSPClientConfig` and `LSPClientExtension`, like `notificationHandlers`, whose return value is the response.
  The inlay hint extension would then handle `workspace/inlayHint/refresh` and advertise `refreshSupport`.

## Where in the code

- Requests from the server get `MethodNotFound`: [`src/client.ts:375-382`](https://github.com/codemirror/lsp-client/blob/6.3.0/src/client.ts#L375-L382).
- Notification handlers, the pattern to follow: [`src/client.ts:364-374`](https://github.com/codemirror/lsp-client/blob/6.3.0/src/client.ts#L364-L374).

## Size / risk

Small for request handlers: a lookup like the notification one, and a response.
Inlay hints are a new extension, so existing users are unaffected.

## Open questions

- Request hints for the visible ranges only, as other clients do, or the whole document?
- Should hints be clickable (their `command` or `location`)?
