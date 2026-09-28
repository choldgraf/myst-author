import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** Run `myst start --headless` in `root`; `ready` resolves with its content server port. */
export function startMyst(root: string) {
  const { PORT, ...env } = process.env; // myst reads PORT as its own theme-server port
  const child = spawn(process.env.MYST_BIN ?? 'myst', ['start', '--headless'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = () => child.kill();
  process.on('exit', stop);

  const ready = new Promise<number>((resolve, reject) => {
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') console.log('mystmd not found; built preview disabled (install mystmd or set MYST_BIN)');
      reject(err);
    });
    child.on('exit', (code) => reject(new Error(`myst exited with code ${code}`)));
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', (line) => {
        console.log(`[myst] ${line}`);
        const port = line.match(/Content server started on port (\d+)/)?.[1];
        if (port) resolve(Number(port));
      });
    }
  });
  return { ready, stop };
}
