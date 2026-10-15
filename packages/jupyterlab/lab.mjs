// `npm run lab -- project [jupyter lab options]`: JupyterLab with this extension and the host server, for a MyST project.
// JupyterLab runs in its own environment (uvx), with its config and extensions in a Jupyter folder inside dist/.
// So it neither uses nor changes your own Jupyter setup, such as other extensions you've installed.
import { spawn } from 'node:child_process';
import { mkdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../..');
const [arg, ...options] = process.argv.slice(2);
if (!arg) {
  console.error('Usage: npm run lab -- path/to/project [jupyter lab options]\nTo try a copy of the tour, run npm run demo:lab.');
  process.exit(1);
}
const project = resolve(arg);

const data = join(import.meta.dirname, 'dist/jupyter');
const link = join(data, 'labextensions/@myst-author/jupyterlab');
mkdirSync(dirname(link), { recursive: true });
try { unlinkSync(link); } catch {} // the link from a previous run (unlink removes the link, never what it points to)
symlinkSync(join(import.meta.dirname, 'dist/labextension'), link);

// binder/jupyter_server_config.py runs the host server for MYST_AUTHOR_PROJECT under jupyter-server-proxy.
// `jupyter` comes from jupyter-core; jupyterlab and jupyter-server-proxy go in the same environment.
spawn('uvx', ['--from', 'jupyter-core', '--with', 'jupyterlab', '--with', 'jupyter-server-proxy', 'jupyter', 'lab', `--config=${join(repo, 'binder/jupyter_server_config.py')}`, `--ServerApp.root_dir=${project}`, ...options], {
  stdio: 'inherit',
  env: { ...process.env, JUPYTER_CONFIG_DIR: join(data, 'config'), JUPYTER_DATA_DIR: data, MYST_AUTHOR_PROJECT: project },
});
