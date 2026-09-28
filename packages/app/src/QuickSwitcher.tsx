import { useState } from 'react';

/** Cmd+P file switcher: substring filter, arrows to move, Enter to open, Esc to close. */
export function QuickSwitcher({ files, onPick, onClose }: { files: string[]; onPick: (f: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const matches = files.filter((f) => f.toLowerCase().includes(q.toLowerCase()));
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') setI(Math.min(i + 1, matches.length - 1));
    else if (e.key === 'ArrowUp') setI(Math.max(i - 1, 0));
    else if (e.key === 'Enter' && matches[i]) onPick(matches[i]);
    else return;
    e.preventDefault();
  }
  return (
    <div className="switcher" role="dialog" aria-label="Open file">
      <input autoFocus value={q} placeholder="Open file…" onKeyDown={onKeyDown} onBlur={onClose}
        onChange={(e) => { setQ(e.target.value); setI(0); }} />
      <ul role="listbox">
        {matches.map((f, n) => (
          <li key={f} role="option" aria-selected={n === i} onMouseDown={() => onPick(f)}>{f}</li>
        ))}
      </ul>
    </div>
  );
}
