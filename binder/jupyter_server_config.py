# Serves MyST Author at <server>/myst-author/ via jupyter-server-proxy.
# postBuild symlinks this file into ~/.jupyter/, so resolve the link to find the repo.
import os

repo = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))

c.ServerProxy.servers = {
    "myst-author": {
        "command": ["node", f"{repo}/packages/app/server/index.ts", f"{repo}/docs/examples/tour"],
        "environment": {"PORT": "{port}", "NODE_ENV": "production", "NO_OPEN": "1"},
        "timeout": 30,
        "launcher_entry": {"title": "MyST Author"},
    }
}
