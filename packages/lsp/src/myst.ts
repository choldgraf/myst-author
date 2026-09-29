import { spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { createInterface } from 'node:readline';

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
 * Run `myst start --headless` in `root`.
 * We pick the content server's port, so `url` is known before the first build; `ready` resolves once it's serving.
 */
export async function startMyst(root: string) {
  const port = await freePort();
  // myst reads PORT as its own theme-server port. Pin HOST so it doesn't bind IPv6-only `localhost`, which proxies like code-server's miss.
  const { PORT, ...rest } = process.env;
  const env = { ...rest, HOST: '127.0.0.1' };
  const args = ['start', '--headless', '--server-port', String(port)];
  const child = spawn(process.env.MYST_BIN ?? 'myst', args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = () => child.kill();
  process.on('exit', stop);

  const ready = new Promise<void>((resolve, reject) => {
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') console.log('mystmd not found; built preview disabled (install mystmd or set MYST_BIN)');
      reject(err);
    });
    child.on('exit', (code) => reject(new Error(`myst exited with code ${code}`)));
    for (const stream of [child.stdout, child.stderr]) {
      createInterface({ input: stream }).on('line', (line) => {
        console.log(`[myst] ${line}`);
        if (line.includes('Content server started')) resolve();
      });
    }
  });
  return { url: `http://127.0.0.1:${port}`, ready, stop };
}

/** Language server arguments for a content server and, optionally, a project folder that overrides the client's; hosts pass them when they start the server. */
export const lspArgs = (contentServer: string | undefined, root?: string) => [
  ...(contentServer ? [`--content-server=${contentServer}`] : []),
  ...(root ? [`--root=${root}`] : []),
];
