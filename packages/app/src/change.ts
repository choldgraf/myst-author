/** The one edit that turns `prev` into `next`, touching only what lies between their common start and end, so the cursor and scroll stay put. */
export function minimalChange(prev: string, next: string) {
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let end = 0; // the common end's length, which can't overlap the common start
  while (end < prev.length - start && end < next.length - start && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++;
  return { from: start, to: prev.length - end, insert: next.slice(start, next.length - end) };
}
