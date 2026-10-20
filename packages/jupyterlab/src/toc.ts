import { PathExt } from '@jupyterlab/coreutils';
import type { IDocumentManager } from '@jupyterlab/docmanager';
import { Widget } from '@lumino/widgets';
import type { Editor, Project, ProjectFor } from './index.ts';

/**
 * A left sidebar panel with the table of contents of the current Markdown editor's project.
 * Clicking a page opens it.
 */
export class MystToc extends Widget {
  private project?: Project;
  private following?: Editor; // the editor whose project is being looked up, so a slow answer can't overtake a newer one

  constructor(
    private docs: IDocumentManager,
    private projectFor: ProjectFor,
  ) {
    super();
    this.id = 'myst-author-toc';
    this.title.label = 'MyST';
    this.title.caption = 'MyST TOC';
    this.addClass('myst-author-toc');
  }

  /**
   * Follow `editor`'s project.
   * A file with no project leaves the view on the last one.
   */
  async follow(editor: Editor) {
    this.following = editor;
    const project = await this.projectFor(editor.context.path);
    if (!project || this.following !== editor || project === this.project) return;
    this.project = project;
    this.refresh();
  }

  /** The plugin calls this when a project rebuilds. */
  rebuilt(project: Project) {
    if (project === this.project) this.refresh();
  }

  // There's no table of contents until mystmd is up.
  // A failure leaves the view as it is, since the project's next build calls `rebuilt`.
  private async refresh() {
    const { root, content } = this.project!;
    const entries = await content.toc().catch(() => undefined);
    if (!entries || this.project?.root !== root) return; // nothing yet, or the view moved to another project meanwhile
    this.node.replaceChildren(
      ...entries.map(({ title, level, file }) => {
        const item = document.createElement(file ? 'button' : 'div');
        item.textContent = title;
        item.style.paddingLeft = `${level}em`;
        if (file) item.onclick = () => void this.docs.openOrReveal(PathExt.join(root, file));
        return item;
      }),
    );
  }
}
