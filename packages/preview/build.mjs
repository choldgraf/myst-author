// Compiles the preview's CSS (myst-theme's Tailwind styles, and KaTeX's) for hosts that bundle it: VS Code's webviews and JupyterLab's live blocks.
// The web app compiles it through Vite instead (packages/app/postcss.config.cjs).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = (file) => fileURLToPath(new URL(file, import.meta.url));

export function buildCss(outfile) {
  execFileSync('npx', ['tailwindcss', '-c', here('tailwind.config.cjs'), '-i', here('src/page.css'), '-o', outfile, '--minify'], { stdio: 'inherit' });
}
