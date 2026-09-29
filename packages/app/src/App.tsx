import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView } from 'codemirror';
import type { DocumentSymbol, SymbolInformation } from 'vscode-languageserver-protocol';
import { connectLsp } from '@myst-author/lsp/client';
import { findLabel } from '@myst-author/lsp/labels';
import { type Built, Preview, usePreview } from '@myst-author/preview';
import { contentServer } from '@myst-author/mystmd/built';
import { followLink } from '@myst-author/preview/controller';
import { listFiles, projectRoot, readFile, writeFile } from './api.ts';
import { Editor } from './Editor.tsx';
import { myst } from 'codemirror-lang-myst';
import { type Item, QuickSwitcher } from './QuickSwitcher.tsx';

type Doc = { path: string; text: string };
type Lsp = ReturnType<typeof connectLsp>;

// The host server proxies the content server under myst/ (relative, like every app URL).
const content = contentServer('myst');

export function App() {
  const [files, setFiles] = useState<string[]>([]);
  const [doc, setDoc] = useState<Doc | null>(null); // the file as loaded (editor's initial content)
  const [text, setText] = useState(''); // live editor content
  const [status, setStatus] = useState('');
  const [showFiles, setShowFiles] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [switcher, setSwitcher] = useState(false);
  const [topLine, setTopLine] = useState(1);
  const [built, setBuilt] = useState<Built | null>(null); // mystmd's latest build of the open file
  const [lsp, setLsp] = useState<Lsp | null>(null);
  const viewOpened = useRef<((view: EditorView | null) => void) | null>(null); // resolves a cross-file jump
  const saved = useRef(''); // last text known to be on disk
  const viewRef = useRef<EditorView | null>(null);
  const latest = useRef({ doc, text });
  latest.current = { doc, text };

  const open = useCallback(async (path: string) => {
    setSwitcher(false);
    let loaded: string;
    try {
      loaded = await readFile(path);
      // Flush after loading, reading the ref, so keystrokes typed while the switch was in flight aren't lost.
      const cur = latest.current;
      if (cur.doc && cur.text !== saved.current) await writeFile(cur.doc.path, cur.text);
    } catch (err) {
      setStatus(`couldn't open ${path}: ${(err as Error).message}`);
      return;
    }
    saved.current = loaded;
    setText(loaded);
    setDoc({ path, text: loaded });
    setTopLine(1);
    setStatus('');
  }, []);

  useEffect(() => {
    Promise.all([listFiles(), projectRoot()]).then(([f, root]) => {
      const l = connectLsp('lsp', root);
      // Go to definition in another file: open it, then hand lsp-client the new editor (see the effect below).
      l.client.workspace.displayFile = (uri) => {
        const path = l.path(uri);
        if (!path) return Promise.resolve(null);
        return new Promise((resolve) => { viewOpened.current = resolve; open(path); });
      };
      setLsp(l);
      setFiles(f);
      const first = f.includes('index.md') ? 'index.md' : f[0];
      if (first) open(first);
    }, (err) => setStatus(`couldn't load the project: ${err.message}`));
  }, []);

  useEffect(() => {
    if (!doc || text === saved.current) return;
    setStatus('unsaved');
    const t = setTimeout(() => {
      writeFile(doc.path, text)
        .then(() => { saved.current = text; setStatus('saved'); })
        .catch((err) => setStatus(`save failed: ${err.message}`));
    }, 500);
    return () => clearTimeout(t);
  }, [doc, text]);

  // Last-chance save when the tab closes.
  useEffect(() => {
    const flush = () => { if (doc && text !== saved.current) writeFile(doc.path, text, true); };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [doc, text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') { e.preventDefault(); setSwitcher(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The new Editor's mount effect (a child) has already set viewRef by the time this runs.
  useEffect(() => {
    viewOpened.current?.(viewRef.current);
    viewOpened.current = null;
  }, [doc]);

  const refreshBuilt = useCallback(() => {
    const path = latest.current.doc?.path;
    if (!path) return;
    content.page(path)
      .then((page): Built => ({ path, page }), (err): Built => ({ path, page: null, error: err.message }))
      .then((b) => latest.current.doc?.path === path && setBuilt(b));
  }, []);
  useEffect(refreshBuilt, [doc]);
  useEffect(() => content.watch(refreshBuilt), []);

  const { result, badge } = usePreview(doc?.path, text, text !== saved.current, built);

  function gotoLine(line: number) {
    const view = viewRef.current;
    if (!view) return;
    const pos = view.state.doc.line(Math.min(line, view.state.doc.lines)).from;
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'nearest' }) });
    view.focus();
  }

  function openAt(path: string, line: number) {
    if (path === doc?.path) return gotoLine(line);
    new Promise((resolve) => { viewOpened.current = resolve; open(path); }).then(() => gotoLine(line));
  }

  // The switcher: `@label` searches the project's labels (as in MyST's `@label` references), `#` this page's outline, anything else file names.
  async function search(q: string): Promise<Item[]> {
    if (!q.startsWith('@') && !q.startsWith('#')) return files.filter((f) => f.toLowerCase().includes(q.toLowerCase())).map((f) => ({ label: f, path: f }));
    if (!lsp) return [];
    if (q.startsWith('@')) {
      const labels = await lsp.client.request<unknown, SymbolInformation[] | null>('workspace/symbol', { query: q.slice(1) });
      return (labels ?? []).flatMap((s) => {
        const path = lsp.path(s.location.uri);
        return path ? [{ label: s.name, detail: s.containerName, path, line: s.location.range.start.line + 1 }] : [];
      });
    }
    if (!doc) return [];
    const outline = await lsp.client.request<unknown, DocumentSymbol[] | null>('textDocument/documentSymbol', { textDocument: { uri: lsp.uri(doc.path) } });
    const flat = (symbols: DocumentSymbol[]): DocumentSymbol[] => symbols.flatMap((s) => [s, ...flat(s.children ?? [])]);
    return flat(outline ?? [])
      .filter((s) => s.name.toLowerCase().includes(q.slice(1).toLowerCase()))
      .map((s) => ({ label: s.name, detail: s.detail, path: doc.path, line: s.range.start.line + 1 }));
  }

  function pick(item: Item) {
    setSwitcher(false);
    if (item.line) openAt(item.path, item.line);
    else open(item.path);
  }

  // Cmd/Ctrl-click on a preview link: external links open a tab, internal ones open the file at the target.
  function follow(href: string, line?: number) {
    if (!doc) return;
    followLink({
      open: (path, line) => (files.includes(path) ? openAt(path, line + 1) : setStatus(`can't open ${path}`)),
      openExternal: (url) => void window.open(url, '_blank'),
      findLabel: async (id) => {
        if (!lsp) return undefined;
        const s = await findLabel((method, params) => lsp.client.request(method, params), id);
        const path = s && lsp.path(s.uri);
        return path ? { path, line: s.line } : undefined;
      },
      warn: setStatus,
      fileForSlug: content.fileForSlug,
    }, doc.path, href, line);
  }

  return (
    <div className="layout">
      <div className="toolbar">
        <button onClick={() => setShowFiles(!showFiles)}>Files</button>
        <button onClick={() => setSwitcher(true)}>Open… (⌘P)</button>
        <button onClick={() => setShowPreview(!showPreview)}>Preview</button>
        <span className="status">{doc?.path} {status}</span>
        <span className="badge" title="Preview source">{badge}</span>
      </div>
      <div className="panes">
        {showFiles && (
          <nav className="files" aria-label="Files">
            {files.map((f) => {
              const slash = f.lastIndexOf('/') + 1;
              return (
                <button key={f} aria-current={f === doc?.path} onClick={() => open(f)}>
                  <span className="dir">{f.slice(0, slash)}</span>{f.slice(slash)}
                </button>
              );
            })}
          </nav>
        )}
        {doc && <Editor key={doc.path} initial={doc.text} onChange={setText} onTopLine={setTopLine} viewRef={viewRef}
          extensions={lsp ? [lsp.client.plugin(lsp.uri(doc.path), 'markdown'), myst()] : myst()} />}
        {showPreview && (
          <div className="preview">
            <Preview result={result} topLine={topLine} onLineClick={gotoLine} onFollowLink={follow} />
          </div>
        )}
      </div>
      {switcher && <QuickSwitcher search={search} onPick={pick} onClose={() => setSwitcher(false)} />}
    </div>
  );
}
