# U2: Send structured diagnostics over the `myst start` websocket

Code references are against mystmd `main` at [`e64d019`](https://github.com/jupyter-book/mystmd/tree/e64d019).

## Problem

Build warnings reach the console as formatted strings, and the `/socket` websocket only ever sends `RELOAD` from mystmd itself.
The `LOG` type is declared, but only downstream tools (for example curvenote-cli) send it.
Tools that consume `myst start --headless` therefore can't show a warning at its file and line.

## Who benefits

- Editors and language tooling: squiggles and a problems panel that update after each rebuild.
- Themes: a dev-mode warning overlay in the browser.
- CI and `--strict`-style checks: the same data written to `_build/logs/myst.build.json` gives CI a machine-readable report.

## Proposal

The store already holds a structured, per-file warning list (`state.local.warnings: Record<file, BuildWarning[]>`).
Broadcast a snapshot of it before every `RELOAD`, and once when a client connects.

```json
{ "type": "DIAGNOSTICS",
  "files": { "/abs/path/intro.md": [
    { "kind": "warn", "message": "Cross reference target was not found: fig-rain",
      "ruleId": "reference-target-resolves", "url": null, "note": null,
      "position": { "start": { "line": 12, "column": 3 }, "end": { "line": 12, "column": 14 } } } ] } }
```

Why a full snapshot rather than per-file messages: one edit can change warnings on other pages (for example a removed label breaks xrefs elsewhere), and a snapshot lets clients simply replace their state.

Sketch (all in `start.ts`):

```ts
const sendDiagnostics = () =>
  sendJson({ type: 'DIAGNOSTICS', files: session.store.getState().local.warnings });
// on connection: ws.send(JSON.stringify({ type: 'DIAGNOSTICS', files: ... }))
// in startServer: watchContent(session, () => { sendDiagnostics(); sendReload(); }, opts)
```

For CI, add `warnings: session.store.getState().local.warnings` to `buildLog` before `writeJsonLogs`.

### Also in page JSON

Each page's own warnings could also go in its page JSON (`/content/{slug}.json`), for example as `warnings: BuildWarning[]`.
Tools that already read page JSON then get them without a websocket client.
For example, mystmd-lsp could forward mystmd's warnings as diagnostics instead of reimplementing checks such as unknown directives and missing targets.

## Where in the code

- Socket and `sendJson`: [`build/site/start.ts:93-135`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/build/site/start.ts#L93-L135); the connection handler is at line 99.
- Only `sendReload` is passed to the watcher: [`start.ts:235`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/build/site/start.ts#L235); the watcher calls it after each rebuild in [`build/site/watch.ts:84,133`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/build/site/watch.ts#L84).
- All vfile messages go through `logMessagesFromVFile` into `addWarningForFile`, which applies `error_rules` severity overrides and dispatches to the store: [`utils/logging.ts:9-25`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/utils/logging.ts#L9-L25), [`utils/addWarningForFile.ts:41-114`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/utils/addWarningForFile.ts#L41-L114).
- Store slice and type: [`store/reducers.ts:204-220`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/store/reducers.ts#L204-L220), [`store/types.ts:13-20`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/store/types.ts#L13-L20).
- `--strict` already reads this store: [`process/site.ts:701-736`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/process/site.ts#L701-L736).
- Build log for CI: [`build/build.ts:226,291`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/build/build.ts#L291).
- Docs: [`docs/theme-developer.md:26,47`](https://github.com/jupyter-book/mystmd/blob/e64d019/docs/theme-developer.md#L26) describe `/socket`.

## Size / risk

Small: about 15-20 lines in `start.ts`, one line in `build.ts`, and a paragraph in the docs.
The message type is additive; clients that only handle `RELOAD` should ignore it (check myst-theme's socket handler).
The main risk is stale or duplicated entries (see below).

## Open questions

- Staleness: warnings are cleared per file only in `loadFile` ([`process/file.ts:241`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/process/file.ts#L241)), and `clearAllWarnings` is never called.
  `fastProcessFile` re-runs post-processing for *all* pages but reloads only the changed one ([`site.ts:484-531`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/process/site.ts#L484-L531)), so warnings on unchanged pages appear to pile up and can go stale.
  This needs checking and fixing, for example by clearing post-stage warnings per page.
- File keys: send absolute paths as stored, or paths relative to the project root?
- Should warnings with no file (plain `session.log.warn`) also be sent? They are not in the store today.
- Column accuracy depends on parser positions (see U7); lines are reliable today.
