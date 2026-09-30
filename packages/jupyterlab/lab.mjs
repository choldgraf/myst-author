// `npm run lab -- [project] [jupyter lab options]`: JupyterLab with this extension and the MyST Author server, for a MyST project (default: the tour).
// The extension loads from a Jupyter folder inside dist/, so nothing is installed into your own Jupyter setup.
import { spawn } from 'node:child_process';
import { mkdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../..');
const [arg, ...options] = process.argv.slice(2);
const project = resolve(arg ?? join(repo, 'docs/examples/tour'));

const data = join(import.meta.dirname, 'dist/jupyter');
const link = join(data, 'labextensions/@myst-author/jupyterlab');
mkdirSync(dirname(link), { recursive: true });
try { unlinkSync(link); } catch {} // the link from a previous run (unlink removes the link, never what it points to)
symlinkSync(join(import.meta.dirname, 'dist/labextension'), link);

// binder/jupyter_server_config.py runs the MyST Author server for MYST_AUTHOR_PROJECT under jupyter-server-proxy.
spawn('jupyter', ['lab', `--config=${join(repo, 'binder/jupyter_server_config.py')}`, `--ServerApp.root_dir=${project}`, ...options], {
  stdio: 'inherit',
  env: { ...process.env, JUPYTER_PATH: [data, process.env.JUPYTER_PATH].filter(Boolean).join(':'), MYST_AUTHOR_PROJECT: project },
});
