// VS Code runs extensions on its own Node without TypeScript support, so bundle everything into dist/.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// markdown-it requires `punycode`; use the npm package, not Node's deprecated builtin.
const alias = { punycode: 'punycode/punycode.js' };
const node = { alias, bundle: true, platform: 'node', format: 'cjs', target: 'node20', sourcemap: true, logLevel: 'warning' };
await Promise.all([
  build({ ...node, entryPoints: ['src/extension.ts'], outfile: 'dist/extension.js', external: ['vscode'] }),
  build({ ...node, entryPoints: ['../lsp/src/server.ts'], outfile: 'dist/lsp.js' }),
  build({
    entryPoints: ['src/webview.tsx'],
    outfile: 'dist/webview.js',
    alias,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  }),
]);

execFileSync('npx', ['tailwindcss', '-c', 'tailwind.config.cjs', '-i', '../preview/src/page.css', '-o', 'dist/webview.css', '--minify'], { stdio: 'inherit' });
// katex.min.css refers to its fonts relative to itself.
const katex = dirname(createRequire(import.meta.url).resolve('katex/package.json'));
cpSync(join(katex, 'dist/fonts'), 'dist/fonts', { recursive: true });
