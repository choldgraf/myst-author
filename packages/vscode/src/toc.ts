import { join } from 'node:path';
import * as vscode from 'vscode';
import type { TocEntry } from 'mystmd-client/content-server';
import { isMarkdown, type Project, type ProjectFor } from './project.ts';

type TocNode = TocEntry & { children: TocNode[] };

/** Nest a flat table of contents by level: each entry goes under the nearest earlier entry with a lower level. */
function nest(entries: TocEntry[]) {
  const roots: TocNode[] = [];
  const open: TocNode[] = []; // the entries a next one could go under, outermost first
  for (const entry of entries) {
    const node: TocNode = { ...entry, children: [] };
    while (open.length && open[open.length - 1].level >= entry.level) open.pop();
    (open.length ? open[open.length - 1].children : roots).push(node);
    open.push(node);
  }
  return roots;
}

/** The "MyST Pages" view in the Explorer: the table of contents of the active Markdown file's project, which opens a page on click. */
export class MystToc implements vscode.TreeDataProvider<TocNode> {
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private project?: Project;
  private unwatch?: () => void;
  private following?: vscode.TextEditor; // as in MystPreview: a slow project lookup can't overtake a newer one

  constructor(context: vscode.ExtensionContext, private projectFor: ProjectFor) {
    context.subscriptions.push(
      vscode.window.createTreeView('mystAuthor.toc', { treeDataProvider: this }),
      new vscode.Disposable(() => this.unwatch?.()),
      vscode.window.onDidChangeActiveTextEditor((e) => e && isMarkdown(e.document) && this.follow(e)),
    );
    const active = vscode.window.activeTextEditor;
    if (active && isMarkdown(active.document)) this.follow(active);
  }

  /** Show `editor`'s project, and refresh on each of its rebuilds. A file with no project leaves the view on the last one. */
  private async follow(editor: vscode.TextEditor) {
    this.following = editor;
    const project = await this.projectFor(editor.document.uri);
    if (!project || this.following !== editor || project === this.project) return;
    this.project = project;
    this.unwatch?.();
    this.unwatch = project.content.watch(() => this.changed.fire());
  }

  async getChildren(node?: TocNode) {
    if (node) return node.children;
    return this.project ? nest(await this.project.content.toc()) : [];
  }

  getTreeItem(node: TocNode) {
    const item = new vscode.TreeItem(node.title, node.children.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    if (node.file) {
      const uri = vscode.Uri.file(join(this.project!.root, node.file));
      item.command = { command: 'vscode.open', title: 'Open', arguments: [uri] };
      item.tooltip = node.file;
    }
    return item;
  }
}
