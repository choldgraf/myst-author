---
title: Preview
description: The fast and built previews, the badge, click-to-source, scroll sync, and following links.
---

The preview shows the open file as a MyST page.
Use the **Preview** button in the toolbar to show or hide it.

## Fast and built previews

There are two versions of the preview, shown in the same pane:

- The **fast preview** renders the page in your browser as you type.
  It uses mystmd's parser, but some things only work in a full build, such as `{include}`, embeds, and notebook outputs.
  Embeds show a placeholder until the build is ready.
- The **built preview** is mystmd's own output from `myst start`.
  It is exact.

The editor shows the built preview whenever mystmd's latest build matches the text in the editor, and the fast preview otherwise.
The badge in the toolbar tells you which one you're looking at:

| Badge | Meaning |
|---|---|
| `fast preview · unsaved` | The file has unsaved changes, and mystmd only builds saved files. The web editor saves as you type; in JupyterLab and VS Code, save the file to build it. |
| `fast preview` | You're looking at the fast preview. You see it while mystmd starts, if mystmd stops, and for files mystmd doesn't build (such as files left out of the `toc` in `myst.yml`). |
| `building…` | Your changes are saved and mystmd is rebuilding. You only see it for files mystmd has built before. |
| `built ✓` | You're looking at mystmd's build of exactly this text. |
| `no mystmd` | mystmd isn't installed, so only the fast preview is available. |

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
