import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sha256, type BuiltPage } from './built.ts';
import { fromBuiltPage, parseMyst } from './parse.ts';
import { Preview } from './Preview.tsx';

/**
 * A page that previews one file for a host editor (a VS Code webview, a JupyterLab iframe).
 * The host sends `text`, `built`, and `scroll` messages; the page sends `ready`, `reveal`, and `follow`.
 */
type Host = { postMessage(message: unknown): void };

type Doc = { path: string; text: string; dirty: boolean };
type Built = { path: string; page: BuiltPage | null; error?: string };

function App({ host }: { host: Host }) {
  const [doc, setDoc] = useState<Doc | null>(null); // the active editor's live text (from the extension)
  const [built, setBuilt] = useState<Built | null>(null); // mystmd's latest build of that file
  const [topLine, setTopLine] = useState(1);
  const [hash, setHash] = useState('');

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

  const text = useDeferredValue(doc?.text ?? '');
  useEffect(() => {
    let current = true;
    sha256(text).then((h) => current && setHash(h));
    return () => { current = false; };
  }, [text]);

  // Same as the web app: show mystmd's build when it matches the editor text exactly; otherwise the fast parse.
  const current = built?.path === doc?.path ? built : null;
  const page = current?.page?.sha256 === hash ? current.page : null;
  const parsed = useMemo(() => (page ? fromBuiltPage(page) : parseMyst(text)), [page, text]);
  const badge = current?.error === 'mystmd not found' ? 'no mystmd'
    : page ? 'built ✓'
    : current?.page && !doc?.dirty ? 'building…'
    : 'fast preview';

  useEffect(() => {
    const blocks = [...document.querySelectorAll<HTMLElement>('[data-line-start]')];
    const el = blocks.findLast((b) => Number(b.dataset.lineStart) <= topLine);
    if (el) el.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }, [topLine]);

  function follow(href: string) {
    // For in-page anchors, also send where the target renders, in case the LSP doesn't know the label.
    const block = href.startsWith('#') ? document.getElementById(decodeURIComponent(href.slice(1)))?.closest<HTMLElement>('[data-line-start]') : null;
    host.postMessage({ type: 'follow', href, line: block ? Number(block.dataset.lineStart) : undefined });
  }

  if (!doc) return <p>Open a markdown file to preview it.</p>;
  return (
    <>
      <span className="badge" title="Preview source">{badge}</span>
      <Preview result={parsed} onLineClick={(line) => host.postMessage({ type: 'reveal', line })} onFollowLink={follow} />
    </>
  );
}

export function mountPreviewPage(host: Host) {
  createRoot(document.getElementById('root')!).render(<App host={host} />);
}
