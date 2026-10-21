---
title: Preview
description: Live preview, the fast and built previews, the preview badge, jumping to the source, scroll sync, and following links.
---

There are two ways to see the open file as a MyST page:

- **Live**, the default in the web editor and JupyterLab, renders it inside the editor.
- **Preview** shows it in a pane beside the editor.

Switch between them, or to plain **Source**, with the buttons in the toolbar.

## Live preview

With **Live** on, paragraphs, headings, directives, equations and other blocks are rendered, except the block with the cursor, which shows its Markdown.
To edit a block, click it or move into it with the arrow keys.
The cursor lands on the text you clicked.

- The page's frontmatter shows as a list of properties under the title, as in Obsidian.
  Click a value to edit it in the YAML.
- Tabs, dropdowns, and buttons in a rendered block work without opening its source.
- A block with a warning, such as a broken reference, has an orange bar on its left.
  Click into the block to see the warning.
- Blocks look the same as in the preview pane.
  They come from mystmd's build or the fast preview, as [Fast and built previews](preview.md#fast-and-built-previews) describes.

Live preview works in the web editor, JupyterLab, and VS Code.
In JupyterLab it also covers notebooks' Markdown cells while you edit them.
[JupyterLab](jupyterlab.md) explains when cells you aren't editing show mystmd's build.
In JupyterLab, turn it on or off with **MyST: Live Preview** in the Command Palette.
In VS Code, switch a Markdown file between the text editor and the live editor with **MyST: Toggle Live Editor**.

## Fast and built previews

There are two versions of the preview, shown in the same pane:

- The **fast preview** renders the page in your browser as you type.
  It uses mystmd's parser, but some things only work in a full build, such as `{include}`, embeds, and running code.
  Embeds, and references to other pages, show grey placeholders until the build is ready.
- The **built preview** is mystmd's own output from `myst start`, so it's exact.
  Embeds and references whose label mystmd can't find show in red with a ⚠, where mystmd's own site shows nothing.

The editor shows the built preview whenever mystmd's latest build matches the text in the editor, and the fast preview otherwise.
In the fast preview, blocks you haven't touched since the last build keep showing the built version.
A badge tells you which one you're looking at.
It's in the toolbar of the web editor, and at the top of the preview pane in VS Code and JupyterLab.

| Badge | Meaning |
|---|---|
| `fast preview · unsaved` | The file has unsaved changes, and mystmd only builds saved files. |
| `fast preview` | mystmd hasn't built this file yet, or doesn't build it. |
| `building…` | Your changes are saved and mystmd is rebuilding. |
| `built ✓` | You're looking at mystmd's build of exactly this text. |
| `no mystmd` | mystmd isn't installed, so only the fast preview is available. |

## Code cells and `{eval}`

mystmd doesn't run code cells or inline `{eval}` expressions unless you turn it on.
Pages still build, and notebooks keep their saved outputs.

To run code:

- In the web editor, run `npm start -- --execute path/to/project`.
- In JupyterLab, set `MYST_AUTHOR_EXECUTE=1` before you start Jupyter.
- In VS Code, the MyST Language Server extension starts mystmd.
  Turn on that extension's `mystmdLsp.execute` setting, then reload the window.

Running code needs Jupyter.
When code runs, the built preview shows its results and outputs.
mystmd runs a page again each time you save a change to its code.

Outputs look like they do on a mystmd site.
HTML output, such as a pandas table, shows too.
HTML with scripts, such as a plotly plot, shows its plain text instead, because its scripts would run with the editor's access to your files.

## mystmd's logs

mystmd's build output, including its warnings, shows up as `[myst]` lines:

- The web editor prints them in the terminal that runs `npm start`.
- JupyterLab puts them in the Jupyter server's log.
- VS Code shows them in the MyST Language Server extension's output channel.

## Click to jump to the source

Click a paragraph, heading, or other block in the preview and the editor moves to its first line.
Clicking tabs, dropdowns, or buttons in the preview doesn't move the editor, and neither does selecting text.
A click on a link [follows it](#links-in-the-preview).

## Scroll sync

Scrolling the editor scrolls the preview to the matching block.
It works in one direction only: scrolling the preview doesn't move the editor.

## Links in the preview

- In the built preview, hovering a reference to another page shows its target, such as the figure or equation.
- A click on a link follows it.
  Web links open in a new browser tab.
  Links to other pages or labels open that file in the editor, at the target.
- Cmd-click (or Ctrl-click) a link to jump to its source line instead, like any other block.
