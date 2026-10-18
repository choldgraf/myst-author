---
title: Bring your own project
---

This page is for JupyterLab and VS Code, on Binder, Codespaces or a JupyterHub.
MyST Author works with the project the open file is in, so any MyST project in the same workspace gets the same help as the tour.
JupyterLab or VS Code handles git: clone in a terminal, and push from the **Git** or **Source Control** view.

:::{tip} Try this: clone a project
Open a terminal from the Launcher or the Terminal menu, and clone the language server's demo project:

```bash
git clone https://github.com/choldgraf/mystmd-lsp
```

Open `mystmd-lsp/demo/index.md`.
The MyST TOC in the sidebar switches to the demo's pages.
Type `` {ref}` `` at the end of any line: the list shows the demo's labels, not the tour's.
Switch back to a tour page and the TOC and labels switch back too.
:::

:::{tip} Try this: push a change
Pushing needs a repository you can write to, so sign in and make the clone a fork of your own:

```bash
gh auth login
gh auth setup-git
cd mystmd-lsp && gh repo fork --remote
```

Edit the demo page you opened above, then commit and push it from the **Git** view in JupyterLab's sidebar, or from VS Code's **Source Control** view.
The clone is a repository of its own, so Source Control lists two repositories.
Pick the `mystmd-lsp` one.
:::

On Codespaces, sign in as [Work with GitHub](https://chrisholdgraf.com/myst-author/guide/github#github-codespaces) describes, since the Codespace's own token only reaches the MyST Author repository.
That page also has a link that pulls a project into Binder for you, the steps for a JupyterHub, and what to know before signing in on a Binder.
