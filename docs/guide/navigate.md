---
title: Find your way around
description: A MyST-aware page outline, and searching labels by name or title.
---

MyST Author knows your project's labels, not just its headings.
It uses them to show each page's outline and to find any label in the project.

## The page outline

The outline lists a page's headings, nested by level.
Under each section it lists that section's figures, tables, equations, and other labeled blocks, with their numbers, such as `Figure 1 · The MyST logo.`

VS Code's built-in Markdown outline only shows headings.
It also misses headings inside directives that use backtick fences, such as a `{tab-item}`, because it reads those as code.

To open the outline:

- In the web editor, press {kbd}`Cmd+P` and type `#`.
  Keep typing to filter, for example `#figure`, and press {kbd}`Enter` to jump there.
- In VS Code, open the **Outline** view in the Explorer sidebar.
  VS Code may also show its own Markdown outline there; the MyST one is the one with figures and equations.
  The breadcrumbs above the editor show the section you're in, and {kbd}`Cmd+Shift+O` searches the outline.

## Find a label anywhere

You can search every label in the project by its name or by its text.
For example, `sea` finds a figure labeled `fig-slr` if its caption mentions sea level.

- In the web editor, press {kbd}`Cmd+P` and type `@` followed by your search.
  This matches how you write a reference to a label in MyST, `@label`.
- In VS Code, press {kbd}`Cmd+T` (Go to Symbol in Workspace).

Reference completion searches the same way: after `` {ref}` ``, type words from a heading or caption instead of the label.

## Things to try

Open the [guided tour](tour.md), then:

1. Open `index.md` and look at its outline.
   The figure and equation appear under **A figure and an equation**, with their numbers.
2. Search `@logo` to jump to the figure, or `@directive` to jump to a heading on another page.
3. In `index.md`, type `` {ref}` `` and then `equation`.
   The completion list offers `tour-figure`, whose heading is "A figure and an equation".
