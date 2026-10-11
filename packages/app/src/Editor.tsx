import { useEffect, useRef, type RefObject } from 'react';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorState, type Extension } from '@codemirror/state';
import { basicSetup, EditorView } from 'codemirror';
import { bodyStart, topLine } from '@myst-author/preview/live';
import { mystCode } from 'myst-syntax/codemirror';

type Props = {
  initial: string;
  onChange: (text: string) => void;
  onTopLine: (line: number) => void;
  viewRef: RefObject<EditorView | null>;
  extensions: Extension;
};

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
        markdown({ codeLanguages: languages, extensions: [mystCode(languages)] }),
        EditorView.lineWrapping,
        initial.includes('\r\n') ? EditorState.lineSeparator.of('\r\n') : [], // keep a CRLF file's line breaks
        extensions,
        EditorView.updateListener.of((u) => u.docChanged && onChange(u.state.sliceDoc())),
      ],
    });
    const onScroll = () => onTopLine(topLine(view));
    view.scrollDOM.addEventListener('scroll', onScroll);
    viewRef.current = view;
    view.focus();
    return () => view.destroy();
  }, []);
  return <div ref={host} className="editor" />;
}
