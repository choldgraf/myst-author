---
title: Find your way around
description: The project's table of contents, a page outline that includes figures and equations, and a search for labels by name or title.
---

MyST Author knows your project's table of contents and its labels, not just its files and headings.
So it can list the project's pages, outline a page by its sections and figures, and find any label in the project.

## The table of contents

The table of contents lists the pages of your project in the order the built site shows them.
It comes from the `toc` in `myst.yml`, or from the files and folders when `myst.yml` has no `toc`.
A part is a title-only entry in the `toc` that groups pages.
It shows as a title you can't click, with its pages under it.
Pages nest under their parent page.
Click a page to open it.
The list updates when mystmd rebuilds.

- In VS Code, it's the **MyST TOC** view in the Explorer sidebar.
  It shows the project of the file you're editing.
- In JupyterLab, it's the **MyST** tab in the left sidebar.

## The page outline

The outline lists a page's headings, nested by level.
Under each section it lists that section's figures, tables, equations, and other labeled blocks.
Each one shows its number, such as `Figure 1 · The MyST logo.`

VS Code's built-in Markdown outline only shows headings.
It also misses headings inside directives that use backtick fences, such as a `{tab-item}`, because it reads those as code.

To open the outline:

- In the web editor, press {kbd}`Cmd+P` and type `#`.
  Keep typing to filter, for example `#figure`, and press {kbd}`Enter` to jump there.
- In VS Code, open the **Outline** view in the Explorer sidebar.
  VS Code may also show its own Markdown outline there.
  The MyST one is the one with figures and equations.
  The breadcrumbs above the editor show the section you're in.
  {kbd}`Cmd+Shift+O` searches the outline.

## Find a label anywhere

You can search every label in the project by its name or by its text.
In VS Code, that's every project open in the window.
For example, `sea` finds a figure labeled `fig-slr` if its caption mentions sea level.

- In the web editor, press {kbd}`Cmd+P` and type `@` followed by your search.
  This matches how you write a reference to a label in MyST, `@label`.
- In VS Code, press {kbd}`Cmd+T` (Go to Symbol in Workspace).

Reference completion searches the same way, within the file's own project.
After `` {ref}` ``, type words from a heading or caption instead of the label.

## Things to try

Open the [guided tour](tour.md), then:

1. Open `index.md` and look at its outline.
   The figure and equation appear under **A figure and an equation**, with their numbers.
2. Search `@logo` to jump to the figure, or `@directive` to jump to a heading on another page.
3. In `index.md`, type `` {ref}` `` and then `equation`.
   The completion list offers `tour-figure`, whose heading is "A figure and an equation".
