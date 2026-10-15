// `npm run demo:vscode`: a fresh copy of the tour, in VS Code with this extension.
// It opens in a separate VS Code with its own settings and extensions, so your own setup doesn't change and extensions you've installed don't load.
// The copy goes in the same folder each time, so VS Code only asks once whether you trust it.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../..');
const tour = join(tmpdir(), 'myst-author-tour');
rmSync(tour, { recursive: true, force: true });
cpSync(join(repo, 'docs/examples/tour'), tour, { recursive: true });

execFileSync('npm', ['run', 'package'], { cwd: import.meta.dirname, stdio: 'inherit' });
const vscode = join(tmpdir(), 'myst-author-vscode');
const dirs = ['--user-data-dir', join(vscode, 'user'), '--extensions-dir', join(vscode, 'extensions')];
// The extensions this one depends on come from deps/ (see deps.mjs), built on the first run.
if (!existsSync(join(import.meta.dirname, 'deps'))) execFileSync('node', ['deps.mjs'], { cwd: import.meta.dirname, stdio: 'inherit' });
const deps = readdirSync(join(import.meta.dirname, 'deps')).map((f) => `deps/${f}`);
for (const vsix of [...deps, 'myst-author.vsix']) {
  execFileSync('code', [...dirs, '--install-extension', join(import.meta.dirname, vsix), '--force'], { stdio: 'inherit' });
}
execFileSync('code', [...dirs, tour, join(tour, 'index.md')], { stdio: 'inherit' });
