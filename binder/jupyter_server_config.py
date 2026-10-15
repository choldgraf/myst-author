# Serves MyST Author's host server at <server>/myst-author/ through jupyter-server-proxy, for the web editor and the JupyterLab extension.
# postBuild symlinks this file into ~/.jupyter/, so resolve the link to find the repo.
import os

repo = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
# The project to edit: MYST_AUTHOR_PROJECT (which `npm run lab` sets), else the tour.
project = os.environ.get("MYST_AUTHOR_PROJECT", f"{repo}/docs/examples/tour")
# Code cells run as mystmd builds. MYST_AUTHOR_EXECUTE=0 turns that off.
execute = [] if os.environ.get("MYST_AUTHOR_EXECUTE") == "0" else ["--execute"]

c.ServerProxy.servers = {
    "myst-author": {
        "command": ["node", f"{repo}/packages/app/server/index.ts", *execute, project],
        "environment": {"PORT": "{port}", "NODE_ENV": "production", "NO_OPEN": "1"},
        "timeout": 30,
        "launcher_entry": {"title": "MyST Author"},
    }
}
