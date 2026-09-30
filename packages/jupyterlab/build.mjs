// JupyterLab loads extensions as webpack module-federation bundles, built by @jupyterlab/builder.
// That bundler only takes JavaScript, so esbuild first compiles our TypeScript (and the workspace packages it uses) to dist/index.js.
// JupyterLab and CodeMirror stay external, so the extension shares Lab's copies (CodeMirror breaks with two).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// The preview's CSS, compiled as for the VS Code webview. index.ts imports it as text, for live preview's shadow roots.
const resolve = createRequire(import.meta.url).resolve;
execFileSync('npx', ['tailwindcss', '-c', resolve('@myst-author/preview/tailwind.config.cjs'), '-i', resolve('@myst-author/preview/page.css'), '-o', 'dist/live.css', '--minify'], { stdio: 'inherit' });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  external: ['@jupyterlab/*', '@lumino/*', '@codemirror/state', '@codemirror/view', '@codemirror/language', '@codemirror/autocomplete', '@lezer/*'],
  loader: { '.css': 'text' },
  jsx: 'automatic',
  logLevel: 'warning',
});
// Same as `jupyter labextension build .`, minus its `jlpm install`, which doesn't work inside an npm workspace.
// The builder needs the installed JupyterLab's core package metadata (which packages Lab shares).
const core = execFileSync('python', ['-c', 'import jupyterlab, os; print(os.path.join(os.path.dirname(jupyterlab.__file__), "staging"))']);
execFileSync('npx', ['build-labextension', '--core-path', String(core).trim(), '.'], { stdio: 'inherit' });
