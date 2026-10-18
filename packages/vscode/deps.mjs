// Builds the .vsix of each extension this one depends on, into deps/, so throwaway installs (Binder, Codespaces, `npm run demo:vscode`) can install them.
// VS Code resolves `extensionDependencies` from its gallery (the Marketplace, or Open VSX for code-server), so this goes away once MyST Syntax and MyST Language Server are published to both.
// Until then, sentences starting "Until ... published" mark what to update at that point.
// They're in the READMEs and docs of this repo, myst-syntax, and mystmd-lsp.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const deps = join(import.meta.dirname, 'deps');
mkdirSync(deps, { recursive: true });
for (const repo of ['myst-syntax', 'mystmd-lsp']) {
  const clone = join(tmpdir(), `myst-author-deps-${repo}`);
  rmSync(clone, { recursive: true, force: true });
  execFileSync('git', ['clone', '--depth', '1', `https://github.com/choldgraf/${repo}`, clone], { stdio: 'inherit' });
  execFileSync('npm', ['ci'], { cwd: clone, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: clone, stdio: 'inherit' });
  execFileSync('npm', ['run', 'package', '-w', 'packages/vscode'], { cwd: clone, stdio: 'inherit' });
  cpSync(join(clone, 'packages/vscode', `${repo}.vsix`), join(deps, `${repo}.vsix`));
}
