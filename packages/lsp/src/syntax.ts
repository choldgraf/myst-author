// Pure, line-based recognition of MyST reference syntax. Character offsets are 0-based.

export type Trigger = 'ref' | 'numref' | 'eq' | 'doc' | 'link-hash' | 'link-path' | 'xref-key' | 'xref-target' | 'directive' | 'role';

/**
 * What the cursor is inside: `prefix` is the text typed so far, `start`/`end` the span a completion replaces.
 * For `xref-target`, `key` is the text between `xref:` and `#` (e.g. `spec/tables`).
 */
export type RefContext = { trigger: Trigger; prefix: string; start: number; end: number; key?: string };

/**
 * A reference in the text. `start`/`end` span the target; `after` is just past the closing delimiter.
 * `text` is the link text of an `xref:` link (undefined for autolinks).
 */
export type Ref = { kind: 'ref' | 'numref' | 'eq' | 'doc' | 'link' | 'xref'; target: string; line: number; start: number; end: number; after: number; text?: string };

// Each pattern matches the text before the cursor; the last group is the prefix.
const contexts: [RegExp, Trigger | null][] = [
  [/\{(ref|numref|eq|doc)\}`(?:[^`<]*<)?([^`<>]*)$/, null], // trigger is the role name
  [/(?:\]\(|<)xref:([^#)>\s]+)#([^)>\s]*)$/, 'xref-target'],
  [/(?:\]\(|<)xref:([^#)>\s]*)$/, 'xref-key'],
  [/\]\(#([^)\s]*)$/, 'link-hash'],
  [/<#([^>\s]*)$/, 'link-hash'],
  [/\]\(([^)\s#]*)$/, 'link-path'],
  [/^\s*(?:`{3,}|:{3,})\{([\w:-]*)$/, 'directive'],
  [/\{([\w:-]*)$/, 'role'],
];

/**
 * Cursor on a directive option line (`:lab|`) directly below `:::{name}` / ```` ```{name} ```` and any earlier options.
 * Returns the directive name, the options already used, and the span a completion replaces.
 */
export function optionAt(lines: string[], line: number, character: number) {
  const m = lines[line].slice(0, character).match(/^\s*:([\w-]*)$/);
  if (!m) return null;
  const used: string[] = [];
  let i = line - 1;
  for (let o; i >= 0 && (o = lines[i].match(/^\s*:([\w-]+):/)); i--) used.push(o[1]);
  const directive = lines[i]?.match(/^\s*(?:`{3,}|:{3,})\{([\w:-]+)\}/)?.[1];
  if (!directive) return null;
  const rest = lines[line].slice(character).match(/^[\w-]*/)![0];
  return { directive, used, prefix: m[1], start: character - m[1].length, end: character + rest.length };
}

export function refAt(lineText: string, character: number): RefContext | null {
  const before = lineText.slice(0, character);
  for (const [re, trigger] of contexts) {
    const m = before.match(re);
    if (!m) continue;
    const prefix = m[m.length - 1];
    const rest = lineText.slice(character).match(/^[^`<>)}\s]*/)![0];
    const ctx: RefContext = { trigger: trigger ?? (m[1] as Trigger), prefix, start: character - prefix.length, end: character + rest.length };
    return trigger === 'xref-target' ? { ...ctx, key: m[1] } : ctx;
  }
  return null;
}

const refPatterns: [RegExp, (m: RegExpExecArray) => Ref['kind']][] = [
  [/\{(ref|numref|eq|doc)\}`(?:[^`<]*<)?([^`<>]+)>?`/g, (m) => m[1] as Ref['kind']],
  [/\]\(#([^)\s]+)\)/g, () => 'link'],
  [/<#([^>\s]+)>/g, () => 'link'],
  [/\[(?<text>[^\]]*)\]\(xref:([^)\s]+)\)/g, () => 'xref'],
  [/<xref:([^>\s]+)>/g, () => 'xref'],
];

// Blank out inline code (keeping roles and offsets) so examples of MyST syntax aren't treated as references.
const maskInlineCode = (line: string) =>
  line.replace(/\{[^}\s]+\}(`+).*?\1|(`+).*?\2/g, (m, role) => (role ? m : ' '.repeat(m.length)));

export function refsInText(text: string): Ref[] {
  const refs: Ref[] = [];
  // Open fences (``` ~~~ :::). Code fences (plain ``` / ~~~, or a {code}/{code-block}/{code-cell} directive) hide everything until they close.
  const fences: { fence: string; code: boolean }[] = [];
  text.split('\n').forEach((raw, line) => {
    const f = raw.match(/^\s*(`{3,}|~{3,}|:{3,})\s*(.*)$/);
    const top = fences.at(-1);
    if (f && top && f[1][0] === top.fence[0] && f[1].length >= top.fence.length && !f[2]) return void fences.pop();
    if (top?.code) return;
    if (f) return void fences.push({ fence: f[1], code: /^\{(code|code-block|code-cell)\}/.test(f[2]) || (f[1][0] !== ':' && !f[2].startsWith('{')) });
    const lineText = maskInlineCode(raw);
    for (const [re, kind] of refPatterns) {
      for (const m of lineText.matchAll(re)) {
        const target = m[m.length - 1];
        const start = m.index! + m[0].lastIndexOf(target);
        refs.push({ kind: kind(m as RegExpExecArray), target, line, start, end: start + target.length, after: m.index! + m[0].length, text: m.groups?.text });
      }
    }
  });
  return refs.sort((a, b) => a.line - b.line || a.start - b.start);
}
