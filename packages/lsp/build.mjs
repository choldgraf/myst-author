// Bundles the server into one file, which starts several times faster than the TypeScript source (it answers `initialize` sooner).
// The VS Code extension builds its copy with the same function.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

export const buildServer = (outfile) => build({
  entryPoints: [fileURLToPath(new URL('src/server.ts', import.meta.url))],
  outfile,
  alias: { punycode: 'punycode/punycode.js' }, // markdown-it requires `punycode`; use the npm package, not Node's deprecated builtin
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  logLevel: 'warning',
});

if (import.meta.main) await buildServer('dist/server.cjs');
