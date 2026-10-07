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
- Blocks render from mystmd's [build](preview.md#fast-and-built-previews) when it matches your text.
  A block you've edited since renders like the fast preview, so its embeds and references to other pages show grey placeholders until mystmd has built your latest saved text.
  In a notebook, cells show the build while the notebook is saved.

Live preview works in the web editor, in JupyterLab, where it also covers notebooks' Markdown cells while you edit them, and in VS Code.
In JupyterLab, turn it on or off with **MyST: Live Preview** in the Command Palette.
In VS Code, switch a Markdown file between the text editor and the live editor with **MyST: Toggle Live Editor**.

## Fast and built previews

There are two versions of the preview, shown in the same pane:

- The **fast preview** renders the page in your browser as you type.
  It uses mystmd's parser, but some things only work in a full build, such as `{include}`, embeds, and notebook outputs.
  Embeds, and references to other pages, show grey placeholders until the build is ready.
- The **built preview** is mystmd's own output from `myst start`.
  It is exact.
  Embeds and references whose label mystmd can't find show in red with a ⚠, instead of the blank mystmd leaves.

The editor shows the built preview whenever mystmd's latest build matches the text in the editor, and the fast preview otherwise.
In the fast preview, blocks you haven't changed since the last matching build still show that build.
The badge in the toolbar tells you which one you're looking at:

| Badge | Meaning |
|---|---|
| `fast preview · unsaved` | The file has unsaved changes, and mystmd only builds saved files. The web editor saves as you type; in JupyterLab and VS Code, save the file to build it. |
| `fast preview` | You're looking at the fast preview. You see it while mystmd starts, if it fails to start or stops, and for files mystmd doesn't build (such as files left out of the `toc` in `myst.yml`). |
| `building…` | Your changes are saved and mystmd is rebuilding. You only see it for files mystmd has built before; a file's first build shows `fast preview`. |
| `built ✓` | You're looking at mystmd's build of exactly this text. |
| `no mystmd` | mystmd isn't installed, so only the fast preview is available. |

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
