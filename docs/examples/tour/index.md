---
title: Welcome to the tour
---

This project is a playground for MyST Author.
Each page has a few **Try this** boxes.
Edit anything you like: the file on disk is what you change, and you can always get the original back from the repository.

The tour uses a little MyST syntax for [cross-references](https://mystmd.org/guide/cross-references).
A line like `(tour-basics)=` sets a label on the heading below it, and a figure's `:label:` option sets one on the figure.
Roles like `{ref}`, `{numref}`, and `{eq}` link to a label.

(tour-basics)=
## The basics

The editor is on the left and the preview is on the right.
Changes save automatically about half a second after you stop typing.

:::{tip} Try this: watch the preview
Change a word in this sentence and watch the preview update.
The badge in the top right says `fast preview` while you type and `built ✓` once mystmd has rebuilt the page.
:::

:::{tip} Try this: click the preview
Click any paragraph in the preview.
The editor jumps to the line it came from.
:::

(tour-figure)=
## A figure and an equation

```{figure} https://raw.githubusercontent.com/jupyter-book/mystmd/main/docs/public/logo.svg
:label: fig-logo
:width: 200px

The MyST logo.
```

$$e^{i\pi}+1=0$$ (euler)

{numref}`fig-logo` shows the logo and {eq}`euler` is Euler's identity.
The faint text after each reference in the editor shows what it will render as.

:::{tip} Try this: complete a reference
Put your cursor at the end of this sentence, type `` {numref}` ``, and pick `fig-logo` from the list.
:::

:::{tip} Try this: hover a reference
Hover over `fig-logo` in the reference above to see what it points to.
:::

:::{tip} Try this: jump around the page
Press {kbd}`Cmd+P` and type `#` to see this page's outline, with the figure and equation under their section.
In VS Code, open the **Outline** view instead.
:::

## Next

The next page, [](references.md), covers links between pages.
Press {kbd}`Cmd+P` (or {kbd}`Ctrl+P`) to open it by name.
