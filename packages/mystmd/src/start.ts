import { spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { createInterface } from 'node:readline';
import { mystmdMissing } from './built.ts';

/** A port that's free on 127.0.0.1 right now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer().on('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

/**
 * Run `myst start --headless` in `root`, or with `site`, `myst start`, which also serves the built site at `siteUrl`.
 * We pick the ports, so `url` (the content server) is known before the first build; `ready` resolves once it's serving, or with `site`, once the site is.
 * `ready` rejects with the message `mystmdMissing` if mystmd isn't installed.
 * mystmd's output goes to `log`, a line at a time.
 */
export async function startMyst(root: string, log = console.log, { site = false } = {}) {
  const [port, sitePort] = await Promise.all([freePort(), freePort()]); // asked together, so they differ
  // myst reads PORT as its own theme-server port. Pin HOST so it doesn't bind IPv6-only `localhost`, which proxies like code-server's miss.
  const { PORT, ...rest } = process.env;
  const env = { ...rest, HOST: '127.0.0.1' };
  const args = ['start', ...(site ? ['--port', String(sitePort)] : ['--headless']), '--server-port', String(port)];
  const child = spawn(process.env.MYST_BIN ?? 'myst', args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = () => child.kill();
  process.on('exit', stop);

  const ready = new Promise<void>((resolve, reject) => {
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') return reject(err);
      log('mystmd not found; built preview disabled (install mystmd or set MYST_BIN)');
      reject(new Error(mystmdMissing));
    });
    child.on('exit', (code) => reject(new Error(`myst exited with code ${code}`)));
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', (line) => {
        log(`[myst] ${line}`);
        // With the site, mystmd doesn't report the content server, only the site once its theme is ready.
        if (line.includes(site ? `started on port ${sitePort}!` : 'Content server started')) resolve();
      });
    }
  });
  ready.catch(() => {}); // callers that don't wait for mystmd mustn't crash when it's missing
  return { url: `http://127.0.0.1:${port}`, siteUrl: `http://127.0.0.1:${sitePort}`, ready, stop };
}
