import { join } from 'node:path';
import * as vscode from 'vscode';
import type { TocEntry } from 'mystmd-client/content-server';
import type { LiveEditor } from './live.ts';
import { isMarkdown, type Project, type ProjectFor } from './project.ts';

type TocNode = TocEntry & { children: TocNode[] };

/** Nest a flat table of contents by level: each entry goes under the nearest earlier entry with a smaller level. */
function nest(entries: TocEntry[]) {
  const roots: TocNode[] = [];
  const open: TocNode[] = []; // the ancestors a next entry could go under, outermost first
  for (const entry of entries) {
    const node: TocNode = { ...entry, children: [] };
    while (open.length && open[open.length - 1].level >= entry.level) open.pop();
    (open.length ? open[open.length - 1].children : roots).push(node);
    open.push(node);
  }
  return roots;
}

/** The "MyST TOC" view in the Explorer: the table of contents of the active Markdown file's project. Clicking a page opens it. */
export class MystToc implements vscode.TreeDataProvider<TocNode> {
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private project?: Project;
  private unwatch?: () => void;
  private following?: vscode.TextDocument; // the document whose project is being looked up, so a slow answer can't overtake a newer one (as in MystPreview)

  constructor(context: vscode.ExtensionContext, private projectFor: ProjectFor, live: LiveEditor) {
    context.subscriptions.push(
      vscode.window.createTreeView('mystAuthor.toc', { treeDataProvider: this }),
      new vscode.Disposable(() => this.unwatch?.()),
      vscode.window.onDidChangeActiveTextEditor((e) => e && isMarkdown(e.document) && this.follow(e.document)),
      live.onDidChangeActiveDocument((d) => this.follow(d)),
    );
    const active = vscode.window.activeTextEditor;
    if (active && isMarkdown(active.document)) this.follow(active.document);
  }

  /** Follow `document`'s project. The project's `watch` calls back on connect, which fills the view, and on each rebuild. A file with no project leaves the view on the last one. */
  private async follow(document: vscode.TextDocument) {
    this.following = document;
    const project = await this.projectFor(document.uri);
    if (!project || this.following !== document || project === this.project) return;
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
