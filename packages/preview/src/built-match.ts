import { StateEffect, type EditorState, type TransactionSpec } from '@codemirror/state';
import { sha256, type BuiltPage } from '@myst-author/mystmd/built';

/**
 * Render from mystmd's build of `text`, which resolves embeds and references to other pages, if the editor still has that text.
 * Until the next build, a block you edit renders from the fast parse, like the preview pane; the others keep the build.
 * Hosts usually call `offerBuilt` instead; this is for content without a hash to check, such as a notebook cell.
 */
export const showBuilt = StateEffect.define<{ page: BuiltPage; text: string }>();

/**
 * Show `page` in live preview if it's mystmd's build of the editor's text. Hosts call it with each build they fetch for the open file.
 * mystmd hashes the file as saved, which may have CRLF line breaks, while CodeMirror's text has `\n`, so both are tried.
 */
export async function offerBuilt(view: { state: EditorState; dispatch(spec: TransactionSpec): void }, page: BuiltPage) {
  const { doc } = view.state;
  const text = doc.toString();
  const matches = page.sha256 === (await sha256(text)) || (doc.lines > 1 && page.sha256 === (await sha256(doc.sliceString(0, undefined, '\r\n'))));
  if (matches) view.dispatch({ effects: showBuilt.of({ page, text }) }); // ignored if the text changed while hashing
}
