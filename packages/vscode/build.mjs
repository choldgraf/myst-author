// VS Code runs extensions on its own Node without TypeScript support, so bundle everything into dist/.
import { build } from 'esbuild';
import { buildCss } from '@myst-author/preview/build';
import { cpSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// markdown-it requires `punycode`; use the npm package, not Node's deprecated builtin.
const alias = { punycode: 'punycode/punycode.js' };
const node = { alias, bundle: true, platform: 'node', format: 'cjs', target: 'node20', sourcemap: true, logLevel: 'warning' };
const webview = { alias, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', minify: true, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' };
await Promise.all([
  build({ ...node, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js', external: ['vscode'] }),
  build({ ...webview, entryPoints: ['src/webview.tsx'], outfile: 'dist/webview.js' }),
  build({ ...webview, entryPoints: ['src/live-webview.tsx'], outfile: 'dist/live.js' }),
]);

const resolve = createRequire(import.meta.url).resolve;
buildCss('dist/webview.css');
// The language server comes bundled already.
cpSync(resolve('mystmd-lsp/dist/server.cjs'), 'dist/lsp.js');
// katex.min.css refers to its fonts relative to itself.
const katex = dirname(resolve('katex/package.json'));
cpSync(join(katex, 'dist/fonts'), 'dist/fonts', { recursive: true });
