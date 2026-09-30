# Serves MyST Author at <server>/myst-author/ via jupyter-server-proxy: the web editor, and the backend of the JupyterLab extension.
# postBuild symlinks this file into ~/.jupyter/, so resolve the link to find the repo.
import os

repo = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
# The project to edit: MYST_AUTHOR_PROJECT (which `npm run lab` sets), else the tour.
project = os.environ.get("MYST_AUTHOR_PROJECT", f"{repo}/docs/examples/tour")

c.ServerProxy.servers = {
    "myst-author": {
        "command": ["node", f"{repo}/packages/app/server/index.ts", project],
        "environment": {"PORT": "{port}", "NODE_ENV": "production", "NO_OPEN": "1"},
        "timeout": 30,
        "launcher_entry": {"title": "MyST Author"},
    }
}
