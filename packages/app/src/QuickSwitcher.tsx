import { useEffect, useState } from 'react';

/** Something to jump to: a file, or a line in one (`line` is 1-based). */
export type Item = { label: string; detail?: string; path: string; line?: number };

/** Cmd+P switcher: `search` turns the query into items. Arrows to move, Enter to open, Esc to close. */
export function QuickSwitcher({ search, onPick, onClose }: { search: (q: string) => Promise<Item[]>; onPick: (item: Item) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const [matches, setMatches] = useState<Item[]>([]);
  useEffect(() => {
    let current = true; // drop results for a query the user has already typed past
    search(q).then((m) => current && setMatches(m));
    return () => { current = false; };
  }, [q]);
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') setI(Math.min(i + 1, matches.length - 1));
    else if (e.key === 'ArrowUp') setI(Math.max(i - 1, 0));
    // Search again: Enter can come before the results for the last keystroke.
    else if (e.key === 'Enter') search(q).then((m) => m[i] && onPick(m[i]));
    else return;
    e.preventDefault();
  }
  return (
    <div className="switcher" role="dialog" aria-label="Open file">
      <input autoFocus value={q} placeholder="Open file…  (@ for labels, # for this page's outline)" onKeyDown={onKeyDown} onBlur={onClose}
        onChange={(e) => { setQ(e.target.value); setI(0); }} />
      <ul role="listbox">
        {matches.map((m, n) => (
          <li key={n} role="option" aria-selected={n === i} onMouseDown={() => onPick(m)}>
            {m.label}{m.detail && <span className="dir"> {m.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
