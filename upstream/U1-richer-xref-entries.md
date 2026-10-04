# U1: Add `title` and `enumerator` to `myst.xref.json` entries

Code references are against mystmd `main` at [`e64d019`](https://github.com/jupyter-book/mystmd/tree/e64d019).

## Problem

Entries in `myst.xref.json` only carry `identifier`, `kind`, `data`, `url`, and `implicit`.
To show "Figure 3: Rainfall by month" for a label, a tool must fetch and walk the page JSON behind `data`, once per page.

## Who benefits

- Editors (autocomplete, hover cards) and other tools that want a cheap index of every label in a project.
- Remote cross-references: `transformMystXRefs` fetches page JSON to compute link text for every remote xref.
- Anyone scraping a MyST site via the documented `myst.xref.json` workflow.
- Language servers: [mystmd-lsp](https://github.com/choldgraf/mystmd-lsp) refetches every page's JSON from `myst start` after each rebuild, so on every save, only to list each label's file, line, enumerator, and text.
  With these fields and a source location (see open questions), and `myst start` rewriting `myst.xref.json` on rebuilds, it could fetch one file instead.

## Proposal

Add two optional fields to `MystXRef`, filled from data already in memory when the file is written.

```ts
export type MystXRef = {
  // ...existing fields
  title?: string;      // heading text, caption text, or page title (plain text)
  enumerator?: string; // "3", "2.1", as rendered on the page; absent if unnumbered
};
```

```json
{ "identifier": "fig-rain", "kind": "figure", "data": "/content/intro.json", "url": "/intro",
  "title": "Rainfall by month.", "enumerator": "3" }
```

The implementation is a few lines in `writeMystXRefJson`.
It uses `getReferenceTitleAsText(target.node)` (already written for `objects.inv`) and `target.node.enumerator` for targets, and `state.title` / `state.enumerator` for pages.
The schema `version` stays `"1"`: the fields are optional and old readers ignore them.

## Where in the code

- Type: [`myst-transforms/src/links/types.ts:18-31`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-transforms/src/links/types.ts#L18-L31).
- Writer: [`myst-cli/src/process/site.ts:128-164`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/process/site.ts#L128-L164) (`writeMystXRefJson`); target entries are built at lines 139-150.
- Title helper, already used for `objects.inv` display text: [`site.ts:114-121`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/process/site.ts#L114-L121) and [`site.ts:277`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/process/site.ts#L277).
- Enumerators are set on nodes by `enumerateTargetsTransform` inside `selectPageReferenceStates` ([`site.ts:378`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/process/site.ts#L378)), which runs before the writer ([`site.ts:748-758`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/process/site.ts#L748-L758)).
- Docs: [`docs/website-metadata.md:43-117`](https://github.com/jupyter-book/mystmd/blob/e64d019/docs/website-metadata.md#L43-L117) (example + field list).
- Test fixtures to regenerate: `packages/mystmd/tests/outputs/*myst.xref.json` (referenced from `packages/mystmd/tests/exports.yml:200-231`).

## Related gap: stale xref file under `myst start`

`fastProcessFile` ([`site.ts:455-544`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-cli/src/process/site.ts#L455-L544)) never rewrites `myst.xref.json`, so a label added during `myst start` is missing until a full rebuild.
It already builds `pageReferenceStates`, so a one-line `await writeMystXRefJson(session, pageReferenceStates)` near line 543 would fix it.

## Size / risk

Small: about 10 lines of code, plus a docs update and regenerated fixtures.
Risk is low because the fields are additive and optional.
The file will get bigger (roughly one caption or heading string per entry).

## Open questions

- Should long captions be truncated (for example to 200 characters) to keep the file small?
- Should we also add a formatted label ("Figure 3")?
  That needs the numbering template, and `getReferenceTemplate` is private in [`enumerate.ts:81-101`](https://github.com/jupyter-book/mystmd/blob/e64d019/packages/myst-transforms/src/enumerate.ts#L81-L101).
  Proposal: leave it out and let consumers format `kind` + `enumerator`.
- Snippet for headings (first paragraph of the section): useful for hover cards, but needs a sibling walk and grows the file more.
  Proposal: leave it for a follow-up.
- Should remote xref resolution use the new fields to skip fetching page JSON? That would be a separate follow-up.
- Should entries also carry their source file and line, for editors' go to definition?
  Page JSON already has the file as `location`, and target nodes have a `position`.
