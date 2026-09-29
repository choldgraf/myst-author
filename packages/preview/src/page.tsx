import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Preview, usePreview, type Built } from './Preview.tsx';

/**
 * A page that previews one file for a host editor (a VS Code webview, a JupyterLab iframe).
 * The host sends `text`, `built`, and `scroll` messages; the page sends `ready`, `reveal`, and `follow`.
 */
type Host = { postMessage(message: unknown): void };

type Doc = { path: string; text: string; dirty: boolean };

function App({ host }: { host: Host }) {
  const [doc, setDoc] = useState<Doc | null>(null); // the active editor's live text (from the extension)
  const [built, setBuilt] = useState<Built | null>(null); // mystmd's latest build of that file
  const [topLine, setTopLine] = useState(1);

  useEffect(() => {
    const onMessage = ({ data: m }: MessageEvent) => {
      if (m.type === 'text') setDoc(m);
      else if (m.type === 'built') setBuilt(m);
      else if (m.type === 'scroll') setTopLine(m.line);
    };
    window.addEventListener('message', onMessage);
    host.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
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

export function mountPreviewPage(host: Host) {
  createRoot(document.getElementById('root')!).render(<App host={host} />);
}
