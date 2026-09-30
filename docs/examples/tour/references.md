---
title: References
---

(tour-references)=
## Links between pages

This links back to [the figure on the first page](#fig-logo), and this to {ref}`tour-basics`.

:::{tip} Try this: go to the definition
Click the paragraph above to show its Markdown, then Cmd-click (or Ctrl-click) `fig-logo`.
The editor opens `index.md` at the figure.
:::

:::{tip} Try this: follow a link in the preview
Open the preview with **Preview** in the toolbar.
There, a plain click on a link jumps to its source line.
Cmd-click (or Ctrl-click) the link instead to open the page it points to.
:::

## A broken reference

The following references point to labels that don't exist:

- {ref}`foo`
- An embed: ![](#foo)

:::{tip} Try this: fix it
The list above has an orange bar, because its references are broken.
Click it to see the squiggles, hover one to read the warning, then change the first `foo` to `tour-references`.
That warning goes away.
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

The next page, [](directives.md), covers directives.
