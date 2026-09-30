import { useEffect, useRef, type RefObject } from 'react';
import { markdown } from '@codemirror/lang-markdown';
import type { Extension } from '@codemirror/state';
import { basicSetup, EditorView } from 'codemirror';

type Props = {
  initial: string;
  onChange: (text: string) => void;
  onTopLine: (line: number) => void;
  viewRef: RefObject<EditorView | null>;
  extensions: Extension;
};

// The cursor starts after any frontmatter, so live preview shows the page title rendered.
const bodyStart = (text: string) => /^---\n[\s\S]*?\n---\n/.exec(text)?.[0].length ?? 0;

/** CodeMirror editor. Remount (via `key`) to load a different file; callbacks must be stable. */
export function Editor({ initial, onChange, onTopLine, viewRef, extensions }: Props) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = new EditorView({
      doc: initial,
      selection: { anchor: bodyStart(initial) },
      parent: host.current!,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        extensions,
        EditorView.updateListener.of((u) => u.docChanged && onChange(u.state.doc.toString())),
      ],
    });
    const onScroll = () => onTopLine(view.state.doc.lineAt(view.lineBlockAtHeight(view.scrollDOM.scrollTop).from).number);
    view.scrollDOM.addEventListener('scroll', onScroll);
    viewRef.current = view;
    view.focus();
    return () => view.destroy();
  }, []);
  return <div ref={host} className="editor" />;
}
