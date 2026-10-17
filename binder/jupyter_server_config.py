# JupyterLab with MyST Author: the language server for the JupyterLab extension, and the web editor in the Launcher.
# postBuild symlinks this file into ~/.jupyter/, so resolve the link to find the repo.
import os

repo = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
# Code cells run as mystmd builds. MYST_AUTHOR_EXECUTE=0 turns that off.
execute = [] if os.environ.get("MYST_AUTHOR_EXECUTE") == "0" else ["--execute"]

# jupyter-lsp (it comes with JupyterLab) runs the language server at <server>/lsp/ws/mystmd-lsp for the JupyterLab extension.
# The server finds each file's project under Jupyter's root folder and runs mystmd for it, which the extension reaches through jupyter-server-proxy's /proxy/<port>/.
c.LanguageServerManager.language_servers = {
    "mystmd-lsp": {
        "version": 2,
        "argv": ["node", f"{repo}/node_modules/mystmd-lsp/dist/server.cjs", "--stdio", *execute],
        "languages": ["markdown"],
        "mime_types": ["text/markdown", "text/x-markdown"],
        "display_name": "mystmd-lsp",
    }
}

# The web editor, at <server>/myst-author/ and in the Launcher, edits one project: MYST_AUTHOR_PROJECT (which `npm run lab` sets), else the tour.
project = os.environ.get("MYST_AUTHOR_PROJECT", f"{repo}/docs/examples/tour")
c.ServerProxy.servers = {
    "myst-author": {
        "command": ["node", f"{repo}/packages/app/server/index.ts", *execute, project],
        "environment": {"PORT": "{port}", "NODE_ENV": "production", "NO_OPEN": "1"},
        "timeout": 30,
        "launcher_entry": {"title": "MyST Author"},
    }
}
