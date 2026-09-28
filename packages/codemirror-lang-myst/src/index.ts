import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/** MyST syntax on top of Markdown. Each regex matches within one line; the whole match is highlighted. */
export const patterns = {
  role: /\{[\w:.-]+\}`[^`\n]*`/g,
  directive: /(?<=^\s*(?:`{3,}|:{3,}))\{[\w:.-]+\}/g,
  // Approximation of "option lines after a fence": decorators only see one line at a time.
  option: /^:[\w-]+:(?=\s|$)/g,
  label: /^\([\w:.-]+\)=(?=\s*$)/g,
  math: /(?<![\\$])\$(?=\S)[^$\n]*?\S\$(?!\$)|(?<![\\$])\$\S\$(?!\$)/g,
  citation: /(?<![\w@])@[\w:.-]*\w/g,
};

const decorators = Object.entries(patterns).map(
  ([name, regexp]) => new MatchDecorator({ regexp, decoration: Decoration.mark({ class: `cm-myst-${name}` }) }),
);

const highlighter = ViewPlugin.fromClass(
  class {
    sets: DecorationSet[];
    constructor(view: EditorView) {
      this.sets = decorators.map((d) => d.createDeco(view));
    }
    update(u: ViewUpdate) {
      this.sets = decorators.map((d, i) => d.updateDeco(u, this.sets[i]));
    }
  },
  { provide: (p) => decorators.map((_, i) => EditorView.decorations.of((view) => view.plugin(p)?.sets[i] ?? Decoration.none)) },
);

const theme = EditorView.baseTheme({
  '.cm-myst-role': { color: '#7c3aed' },
  '.cm-myst-directive': { color: '#0369a1', fontWeight: 'bold' },
  '.cm-myst-option': { color: '#0f766e' },
  '.cm-myst-label': { color: '#b45309' },
  '.cm-myst-math': { color: '#be185d' },
  '.cm-myst-citation': { color: '#15803d' },
});

/** MyST highlighting for roles, directives, options, labels, math and citations. Use with `markdown()`. */
export function myst() {
  return [highlighter, theme];
}
