---
title: References
description: Completion, hints, hover, go to definition, and warnings for cross-references, citations, and external references.
---

The editor helps you write cross-references: it completes them, shows what they point to, and warns about broken ones.
This help comes from [mystmd-lsp](https://chrisholdgraf.com/mystmd-lsp/), a language server that indexes the labels in your project.
Its [features page](https://chrisholdgraf.com/mystmd-lsp/features/) lists everything it does and its limits, including citations and external references (`xref:`).

## Completion

Start typing a reference, such as `` {ref}` `` or `@`, and a list of targets appears.
Each item shows the label, what it is (for example `Figure 1`), and the file it's in.

![Completing a numref reference](../images/complete-numref.png)

## Hints and hover

A hint is faint text after a reference that shows what it will render as, such as `Figure 1` or `(1)`.
Hover a reference to see what it points to and which file it's in.

![Hovering a reference](../images/hover.png)

## Go to definition, find references, and rename

- Cmd-click (or Ctrl-click) a reference, or press {kbd}`F12`, to go to its target.
- Press {kbd}`Shift+F12` on a reference or a label's definition to list every reference to that label.
- Press {kbd}`F2` to rename a label and every reference to it.
  In the web editor, rename only changes the file you have open; use VS Code to rename across files.

## Warnings

A reference to a label that doesn't exist gets a squiggle.
Hover it to read the warning.

![A warning on a broken reference](../images/diagnostic.png)

Warnings start once mystmd's first build has loaded.
Without mystmd, the editor only knows the open file, and doesn't warn about unknown labels.
