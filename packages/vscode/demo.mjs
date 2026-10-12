// `npm run demo:vscode`: a fresh copy of the tour, in VS Code with this extension.
// It opens in a separate VS Code with its own settings and extensions, so your own setup doesn't change and extensions you've installed don't load.
// The copy goes in the same folder each time, so VS Code only asks once whether you trust it.
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../..');
const tour = join(tmpdir(), 'myst-author-tour');
rmSync(tour, { recursive: true, force: true });
cpSync(join(repo, 'docs/examples/tour'), tour, { recursive: true });

execFileSync('npm', ['run', 'package'], { cwd: import.meta.dirname, stdio: 'inherit' });
const vscode = join(tmpdir(), 'myst-author-vscode');
const dirs = ['--user-data-dir', join(vscode, 'user'), '--extensions-dir', join(vscode, 'extensions')];
execFileSync('code', [...dirs, '--install-extension', join(import.meta.dirname, 'myst-author.vsix'), '--force'], { stdio: 'inherit' });
execFileSync('code', [...dirs, tour, join(tour, 'index.md')], { stdio: 'inherit' });
