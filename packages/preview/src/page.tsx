import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Built } from '@myst-author/mystmd/built';
import type { FromPage, ToPage } from './controller.ts';
import { Preview, usePreview } from './Preview.tsx';

/**
 * A page that previews one file for a host editor (a VS Code webview, a JupyterLab panel), driven by a `PreviewController`.
 * `postMessage` sends the host a message; `listen` registers the one function that receives the host's.
 */
type Host = { postMessage(message: FromPage): void; listen(receive: (message: ToPage) => void): void };

type Doc = { path: string; text: string; dirty: boolean };

function App({ host }: { host: Host }) {
  const [doc, setDoc] = useState<Doc | null>(null); // the active editor's live text (from the extension)
  const [built, setBuilt] = useState<Built | null>(null); // mystmd's latest build of that file
  const [topLine, setTopLine] = useState(1);

  useEffect(() => {
    host.listen((m) => {
      if (m.type === 'text') setDoc(m);
      else if (m.type === 'built') setBuilt(m);
      else if (m.type === 'scroll') setTopLine(m.line);
    });
    host.postMessage({ type: 'ready' });
  }, []);

  const { result, badge } = usePreview(doc?.path, doc?.text ?? '', !!doc?.dirty, built);

  if (!doc) return <p>Open a markdown file to preview it.</p>;
  return (
    <>
      <span className="badge" title="Preview source">{badge}</span>
      <Preview
        result={result}
        topLine={topLine}
        onLineClick={(line) => host.postMessage({ type: 'reveal', line })}
        onFollowLink={(href, line) => host.postMessage({ type: 'follow', href, line })}
      />
    </>
  );
}

export function mountPreviewPage(element: Element, host: Host) {
  const root = createRoot(element);
  root.render(<App host={host} />);
  return root;
}
