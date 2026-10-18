import { StateEffect, type EditorState, type TransactionSpec } from '@codemirror/state';
import { savedHashes, type BuiltPage } from 'mystmd-client/content-server';

/**
 * Render from mystmd's build of `text` if the editor still has that text.
 * The build resolves embeds and references to other pages.
 * Until the next build, a block you edit renders from the fast parse, like the preview pane, and the others keep the build.
 * Hosts usually call `offerBuilt` instead. This is for content without a hash to check, such as a notebook cell.
 */
export const showBuilt = StateEffect.define<{ page: BuiltPage; text: string }>();

/**
 * Show `page` in live preview if it's mystmd's build of the editor's text. Hosts call it with each build they fetch for the open file.
 */
export async function offerBuilt(view: { state: EditorState; dispatch(spec: TransactionSpec): void }, page: BuiltPage) {
  const text = view.state.doc.toString();
  if ((await savedHashes(text)).includes(page.sha256)) view.dispatch({ effects: showBuilt.of({ page, text }) }); // ignored if the text changed while hashing
}
