---
title: Guide
description: What each part of MyST Author does, and where its limits are.
---

These pages explain what each part of the editor does and where its limits are.

- [Guided tour](tour.md): try each feature in an example project.
- [References](references.md): completion, hover, and warnings for cross-references.
- [Find your way around](navigate.md): a MyST-aware page outline, and searching labels by name or title.
- [Preview](preview.md): live preview in the editor, the fast and built previews, and how to move between preview and source.
- [Directives and roles](directives.md): completion and highlighting for directives and roles.
- [VS Code](vscode.md): the same features in VS Code.
- [JupyterLab](jupyterlab.md): the same features in JupyterLab.

## The layout

The toolbar has four buttons:

- **Files** shows or hides the file list.
- **Open… (⌘P)** opens a file by name.
  {kbd}`Cmd+P` and {kbd}`Ctrl+P` both work, on any system.
  Start with `@` to jump to a label anywhere in the project, or `#` to jump within this page's [outline](navigate.md).
- **Source**, **Preview** and **Live** switch how the page shows: plain Markdown, Markdown beside the [preview](preview.md) pane, or rendered [inside the editor](preview.md#live-preview) (the default).

On the right of the toolbar are the open file, its save state, and the preview [badge](preview.md#fast-and-built-previews).

One file is open at a time.
Changes save about 500 ms after you stop typing, and again when you close the tab.
