# U10: An mdast → mystmd adapter, to adopt a micromark parser

## Problem

mystmd parses with markdown-it, which isn't [unified](https://unifiedjs.com)'s parser and gives positions by line only (see U7).
[myst-parser-unified](https://github.com/choldgraf/myst-parser-unified) parses MyST with micromark and emits standard mdast, with columns.
mystmd's own parser emits a slightly different tree, and mystmd's transforms rely on it, so the micromark parser isn't a drop-in replacement.

## Proposal

To adopt a micromark parser, mystmd would need an adapter from standard mdast to the shape mystmd's parser emits.
myst-parser-unified's [`docs/differences.md`](https://github.com/choldgraf/myst-parser-unified/blob/main/docs/differences.md) lists what that adapter must do, one difference per item (code `lang`, list `spread`, resolved references, and so on).
Whether mystmd wants the adapter, and the parser, is for mystmd to decide.

## Open questions

- Should the adapter live in mystmd, or should mystmd's transforms accept standard mdast instead?
