---
title: Work with GitHub
description: Pull a MyST project from GitHub into Codespaces, a JupyterHub, or Binder, edit it with MyST Author, and push it back.
---

MyST Author edits files on disk.
It doesn't do git.
You pull a project from GitHub, edit it, and push it back with VS Code, JupyterLab, or a terminal, as usual.

## GitHub Codespaces

Open the [MyST Author Codespace](https://codespaces.new/choldgraf/myst-author), then clone your project in the terminal:

```bash
gh repo clone you/your-book
```

The clone goes inside the MyST Author checkout.
That's fine for a session.
Open a page in it.
The [VS Code extension](vscode.md) finds the project, and completions, the preview and the MyST TOC switch to it.

Codespaces signs you in to GitHub for the repository it was opened from, which is MyST Author's.
Pushing to your own repository needs one more sign-in, in the terminal:

```bash
unset GITHUB_TOKEN   # otherwise gh keeps using the Codespace's token
gh auth login
gh auth setup-git
git push             # from this terminal, which has the new sign-in
```

VS Code's **Source Control** view can commit as usual.
It may keep pushing with the Codespace's token, though, so push from that terminal.

To edit the project in the web editor instead, point it at the clone as [Get started](../get-started.md#open-it-in-github-codespaces) describes.

## JupyterHub

Your hub needs the [JupyterLab extension](jupyterlab.md) and its setup, plus [nbgitpuller](https://nbgitpuller.readthedocs.io), [jupyterlab-git](https://github.com/jupyterlab/jupyterlab-git) and [gh](https://cli.github.com).
[`binder/environment.yml`](https://github.com/choldgraf/myst-author/blob/main/binder/environment.yml) lists them all.

Make a link with the [nbgitpuller link generator](https://nbgitpuller.readthedocs.io/en/latest/link.html).
Fill in your hub's URL, the repository, **JupyterLab** as the application, and the page as the file to open.
Opening the link clones the project into your home folder and opens the page.
If the project is already there, it pulls the latest changes instead.
The extension follows the file you open, so Lab can stay at your home folder.

To commit and push, use the **Git** view in the left sidebar, or a terminal.
Sign in once, and your home folder keeps the credentials:

```bash
gh auth login
gh auth setup-git
```

## Binder

The [MyST Author Binder](get-started.md#open-it-on-binder) has nbgitpuller, jupyterlab-git and `gh`.
A Binder is a throwaway copy, so pulling is easy and pushing takes a sign-in each session.

To pull your project into it, make a link with the [nbgitpuller link generator](https://nbgitpuller.readthedocs.io/en/latest/link.html).
Choose **Binder**, give it `choldgraf/myst-author` as the environment repository, and your project as the content repository.
This one opens the [mystmd-lsp demo project](https://github.com/choldgraf/mystmd-lsp/tree/main/demo):

<https://mybinder.org/v2/gh/choldgraf/myst-author/main?urlpath=git-pull%3Frepo%3Dhttps%253A%252F%252Fgithub.com%252Fcholdgraf%252Fmystmd-lsp%26urlpath%3Dlab%252Ftree%252Fmystmd-lsp%252Fdemo%252Findex.md>

To push, sign in from a terminal in the Binder, then use the **Git** view or `git push`:

```bash
gh auth login      # pick GitHub.com and HTTPS, then paste the code it shows into github.com
gh auth setup-git
```

The sign-in lasts until the Binder session ends.
Anyone with the Binder's URL can use it while it runs, so sign in only from a Binder you launched yourself.
