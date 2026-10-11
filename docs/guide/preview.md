---
title: Preview
description: Live preview in the editor, the fast and built previews, the badge, click-to-source, scroll sync, and following links.
---

There are two ways to see the open file as a MyST page:

- **Live** renders it inside the editor. It's the default.
- **Preview** shows it in a pane beside the editor.

Switch between them, or to plain **Source**, with the buttons in the toolbar.

## Live preview

With **Live** on, each block (a paragraph, heading, directive, or equation) shows rendered, and the block with the cursor shows its Markdown.
To edit a block, click it or move into it with the arrow keys.
The cursor lands on the text you clicked.

- Tabs, dropdowns, and buttons in a rendered block work without opening its source.
- A block with a warning, such as a broken reference, has an orange bar on its left. Open it to see the warning.
- Blocks render like the preview pane, from mystmd's build or the fast preview, as [Fast and built previews](preview.md#fast-and-built-previews) describes.
  In a notebook, cells show the build when the notebook has no unsaved changes.

Live preview works in the web editor, JupyterLab, and VS Code.
In JupyterLab it also covers notebooks' Markdown cells while you edit them.
In JupyterLab, turn it on or off with **MyST: Live Preview** in the Command Palette.
In VS Code, switch a Markdown file between the text editor and the live editor with **MyST: Toggle Live Editor**.

## Fast and built previews

There are two versions of the preview, shown in the same pane:

- The **fast preview** renders the page in your browser as you type.
  It uses mystmd's parser, but some things only work in a full build, such as `{include}`, embeds, and notebook outputs.
  Embeds, and references to other pages, show grey placeholders until the build is ready.
- The **built preview** is mystmd's own output from `myst start`.
  It is exact.
  Embeds and references whose label mystmd can't find show in red with a ⚠, where mystmd's own site shows nothing.

The editor shows the built preview whenever mystmd's latest build matches the text in the editor, and the fast preview otherwise.
In the fast preview, blocks you haven't changed since the last matching build still show that build.
The badge in the toolbar tells you which one you're looking at:

| Badge | Meaning |
|---|---|
| `fast preview · unsaved` | The file has unsaved changes, and mystmd only builds saved files. The web editor saves as you type; in JupyterLab and VS Code, save the file to build it. |
| `fast preview` | mystmd hasn't built this file yet. This happens while mystmd starts, if it fails or stops, and for files it doesn't build, such as files left out of the `toc` in `myst.yml`. |
| `building…` | Your changes are saved and mystmd is rebuilding. You only see it for files mystmd has built before; a file's first build shows `fast preview`. |
| `built ✓` | You're looking at mystmd's build of exactly this text. |
| `no mystmd` | mystmd isn't installed, so only the fast preview is available. |

## Code cells and `{eval}`

mystmd runs code cells and inline `{eval}` expressions only when you turn execution on:

- **Web editor:** `npm start -- --execute path/to/project`.
- **VS Code:** the `mystAuthor.execute` setting, then reload the window.
- **JupyterLab:** set `MYST_AUTHOR_EXECUTE=1` before you start Jupyter.

It runs the project's code, and needs Jupyter.
mystmd runs the page again each time you save a change to its code.

Without execution, the preview shows mystmd's "Unexecuted inline expression" warning, as a mystmd site would.
With it, the built preview shows the results and outputs.
While you edit, results and outputs from the last build stay in place, and an edited code cell's outputs are dimmed until the next build.
A new `{eval}` shows its code in grey until then.

Outputs look like they do on a mystmd site.
HTML output, such as a pandas table, shows too, unless it has scripts, such as a plotly plot: then you see its plain text.
Its scripts would run with the editor's access to your files.

## mystmd's logs

mystmd's build output, including its warnings, shows up as `[myst]` lines:

- **Web editor:** the terminal that runs `npm start`.
- **JupyterLab:** the Jupyter server's log.
- **VS Code:** the **MyST** channel in the Output panel.

## Click to jump to the source

Click a paragraph, heading, or other block in the preview and the editor moves to its first line.
Clicking tabs, dropdowns, or buttons in the preview doesn't move the editor, and neither does selecting text.

## Scroll sync

Scrolling the editor scrolls the preview to the matching block.
It works in one direction only: scrolling the preview doesn't move the editor.

## Links in the preview

- A plain click on a link jumps to its source line, like any other block.
- Cmd-click (or Ctrl-click) follows the link.
  Web links open in a new browser tab.
  Links to other pages or labels open that file in the editor, at the target.
