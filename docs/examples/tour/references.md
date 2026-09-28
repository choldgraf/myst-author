---
title: References
---

(tour-references)=
## Links between pages

This links back to [the figure on the first page](#fig-logo), and this to {ref}`tour-basics`.

:::{tip} Try this: go to the definition
Cmd-click (or Ctrl-click) `fig-logo` in the source above.
The editor opens `index.md` at the figure.
:::

:::{tip} Try this: follow a link in the preview
In the preview, a plain click on a link jumps to its source line.
Cmd-click (or Ctrl-click) the link instead to open the page it points to.
:::

## A broken reference

This reference points at a label that doesn't exist: {ref}`tour-missing`.

:::{tip} Try this: fix it
The reference above has a squiggle.
Hover it to read the warning, then change `tour-missing` to `tour-references`.
The warning goes away.
:::

## External references

An `xref:` link points to a label in another project listed under `project.references` in `myst.yml`.
This project lists the Python docs under the key `python`.
The part after `#` is either a page, like `library/abc`, or an object, like `abc.ABC`.
This links to the `abc` module page: <xref:python#library/abc>.
The editor downloads the Python docs index for this step, so it needs an internet connection.

:::{tip} Try this: complete an external reference
Type `[](xref:python#abc.` below this box and pick a target from the list.
Hover the finished link to see the URL it resolves to.
:::

## Next

The last page, [](directives.md), covers directives.
