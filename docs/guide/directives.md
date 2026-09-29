---
title: Directives and roles
description: Completing directive names, roles, and directive options, plus syntax highlighting and its limits.
---

## Directive and role names

Type ```` ```{ ```` or `:::{` at the start of a line to get a list of directive names.
Type `{` anywhere else to get a list of role names.
The lists include mystmd's built-in directives and roles.
They also include the extensions mystmd turns on by default, such as cards, grids, tabs, proofs, exercises, and buttons.

## Directive options

On the line under a directive, or under its other options, type `:` to list the options that directive accepts.
Options you've already set are left out.
Each item shows the option's type and description.

![Completing a directive option](../images/option-completion.png)

## Hover

Hover a directive name, a directive option, or a role name to read mystmd's description of it.
Not every directive and role has one.

## Files

The file argument of `figure`, `image`, `include`, and `literalinclude` completes file names, relative to the current file.
Cmd-click (or Ctrl-click) it to open the file.
If the file doesn't exist, it gets a warning.
Like mystmd, a path that starts with `/` is relative to the project folder.

## Nested directives

Directives inside other directives, like a `{tab-item}` inside a `{tab-set}`, get the same name and option completion.
References inside nested directives are completed and checked as usual.

## Syntax highlighting

The editor colours MyST syntax on top of normal Markdown highlighting.
This covers roles, directive names, directive options, labels like `(my-label)=`, inline math, and citations like `@smith2020`.

## Known limits

- Highlighting works one line at a time, so any line that looks like an option, such as `:width: 200px`, is coloured as one, even outside a directive.
- Plugin directives and roles from your `myst.yml` aren't in the completion lists, and the fast preview doesn't render them.
  The built preview does.
