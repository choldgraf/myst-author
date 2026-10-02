import { LSPPlugin, type LSPClientExtension } from '@codemirror/lsp-client';
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import type { InlayHint } from 'vscode-languageserver-protocol';

class Hint extends WidgetType {
  constructor(readonly label: string) { super(); }
  eq(other: Hint) { return other.label === this.label; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-inlay-hint';
    span.textContent = this.label;
    return span;
  }
}

const setHints = StateEffect.define<DecorationSet>();
const hints = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (deco, tr) => tr.effects.find((e) => e.is(setHints))?.value ?? deco.map(tr.changes),
  provide: (f) => EditorView.decorations.from(f),
});

async function refresh(view: EditorView) {
  const plugin = LSPPlugin.get(view);
  if (!plugin) return;
  plugin.client.sync();
  const doc = view.state.doc;
  const range = { start: { line: 0, character: 0 }, end: plugin.toPosition(doc.length, doc) };
  const result = await plugin.client.request<unknown, InlayHint[] | null>('textDocument/inlayHint', { textDocument: { uri: plugin.uri }, range });
  if (view.state.doc !== doc || !view.dom.isConnected) return; // stale; the next diagnostics push refreshes again
  const widgets = (result ?? []).map((h) => {
    const label = typeof h.label === 'string' ? h.label : h.label.map((p) => p.value).join('');
    return Decoration.widget({ widget: new Hint(label), side: 1 }).range(plugin.fromPosition(h.position, doc));
  });
  view.dispatch({ effects: setHints.of(Decoration.set(widgets, true)) });
}

/**
 * Inlay hints ("Figure 1" after a reference), which @codemirror/lsp-client doesn't support yet.
 * The server re-publishes diagnostics whenever a document or the project index changes, so we refresh on those.
 */
export function inlayHints(): LSPClientExtension {
  return {
    editorExtension: [hints, EditorView.baseTheme({ '.cm-inlay-hint': { color: '#9ca3af', paddingLeft: '0.3em' } })],
    notificationHandlers: {
      'textDocument/publishDiagnostics': (client, params) => {
        const view = client.workspace.getFile(params.uri)?.getView();
        if (view) refresh(view).catch(() => {});
        return false; // let serverDiagnostics handle them too
      },
    },
  };
}
