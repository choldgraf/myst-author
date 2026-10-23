---
title: Guide
description: What each part of MyST Author does, and where its limits are.
---

These pages explain what each part of MyST Author does and where its limits are.

- [Guided tour](tour.md): try each feature in an example project.
- [References](references.md): completion, hover, and warnings for cross-references.
- [Find your way around](navigate.md): a page outline that includes figures and equations, and searching labels by name or title.
- [Preview](preview.md): live preview in the editor, the fast and built previews, and how to move between preview and source.
- [Directives and roles](directives.md): completion and highlighting for directives and roles.
- [Shortcuts](shortcuts.md): keys for bold, italic, code, and links.
- [VS Code](vscode.md): using MyST Author in VS Code, and what differs.
- [JupyterLab](jupyterlab.md): using MyST Author in JupyterLab, and what differs.
- [Work with GitHub](github.md): pull a project from GitHub and push it back, from Codespaces, a JupyterHub, or Binder.

```{figure} ../videos/web-editor.mp4
The web editor on the tour project.
```

## The web editor

The web editor's toolbar has these buttons:

- **Files** shows or hides the file list.
- **Open ⌘P** opens a file by name.
  {kbd}`Cmd+P` and {kbd}`Ctrl+P` both work, on any system.
  Start with `@` to jump to a label anywhere in the project, or `#` to jump within the open file's [outline](navigate.md).
- **Help** opens this guide.
- **Source** shows plain Markdown.
- **Preview** shows Markdown beside the [preview](preview.md) pane.
- **Live**, the default, shows the rendered page and lets you [edit it in place](preview.md#live-preview).

The open file's name is in the middle of the toolbar.
On the right, a [badge](preview.md#fast-and-built-previews) says which preview you're looking at.

One file is open at a time.
Changes save about 500 ms after you stop typing.
Any change that hasn't saved yet saves when you close the tab.
