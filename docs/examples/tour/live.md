---
title: Live preview
---

With **Live** on, which is the default, each block on this page shows rendered.
The block with your cursor shows its Markdown, so you always edit the source.

(live-editing)=
## Editing a block

This paragraph has **bold text**, `inline code`, a [link](https://mystmd.org), and some inline math, $a^2 + b^2 = c^2$.

:::{tip} Try this: edit in place
Click the words *bold text* in the paragraph above.
Its Markdown appears, with the cursor where you clicked.
Change a word, then click outside the paragraph: it renders again with your change.
:::

:::{tip} Try this: move with the keyboard
Use the up and down arrow keys to move through this page.
Each block shows its Markdown when the cursor reaches it, and renders again when the cursor leaves.
:::

## Figures, equations, and references

```{figure} https://raw.githubusercontent.com/jupyter-book/mystmd/main/docs/public/logo.svg
:label: fig-live
:width: 160px

A figure on this page.
```

```{math}
:label: eq-live
\int_0^1 x^2 \, dx = \frac{1}{3}
```

{numref}`fig-live` and {eq}`eq-live` show as their numbers, and [this link](#live-editing) goes back to the first section.

:::{tip} Try this: rename a label
Click the paragraph above, put the cursor on `fig-live`, and press {kbd}`F2`.
Type a new name and press {kbd}`Enter`.
The figure's `:label:` changes too, and both blocks render with the new name.
:::

## An embed

This embeds the figure from the first page:

![](#fig-logo)

:::{tip} Try this: wait for the build
While you type, the embed is a grey placeholder, because the in-browser render only knows this page.
Once the badge in the top right says `built ✓`, the embed shows the figure.
:::

## Tabs and dropdowns

::::{tab-set}
:::{tab-item} Python
```python
print("Hello")
```
:::
:::{tab-item} R
```r
print("Hello")
```
:::
::::

```{note} A dropdown
:class: dropdown
Hidden until you open it.
```

:::{tip} Try this: use a rendered block
Switch tabs and open the dropdown: they work without showing their Markdown.
Click the code inside a tab to edit it; code stays in a fixed-width font.
:::

## Warnings

This points to {ref}`no-such-label`, which doesn't exist.

:::{tip} Try this: find a warning
The paragraph above has an orange bar on its left, because its reference is broken.
Click the paragraph to see the squiggle, and hover the squiggle to read the warning.
:::

## Find, and the other views

:::{tip} Try this: find a word
Press {kbd}`Cmd+F` (or {kbd}`Ctrl+F`) and search for `Hidden`.
The dropdown above shows its Markdown, with the match selected.
:::

:::{tip} Try this: compare the views
Click **Source** in the toolbar to see the plain Markdown, and **Live** to come back.
Click **Preview** to see the whole page beside the editor.
:::

## Next

The next page, [](references.md), covers links between pages.
