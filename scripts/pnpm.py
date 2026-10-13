#!/usr/bin/env python3
"""Use the isolated, planned Node/pnpm tools without changing global installations."""
from pathlib import Path
import os
import json
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
bundled = next(iter(sorted(Path.home().glob('.cache/*/*/dependencies/node/bin/node'))), Path('/nonexistent'))
node = os.environ.get('SC_NODE') or (str(bundled) if bundled.exists() else shutil.which('node'))
if not node:
    raise SystemExit('Node 24 is required; set SC_NODE to its executable.')
version = subprocess.check_output([node, '--version'], text=True).strip()
if not version.startswith('v24.'):
    raise SystemExit('Node 24 is required; selected ' + version)
env = dict(os.environ)
env['PATH'] = str(Path(node).parent) + os.pathsep + env.get('PATH', '')
env['npm_config_cache'] = str(root / '.tools/npm-cache')
local = root / '.tools/node_modules/pnpm/bin/pnpm.cjs'
command = [node, str(local)] if local.exists() else [shutil.which('pnpm') or 'pnpm']
args = sys.argv[1:]
scripts = json.loads((root / 'package.json').read_text()).get('scripts', {})
if args and args[0] in scripts:
    args.insert(0, 'run')  # e.g. doctor otherwise selects pnpm's own built-in command.
raise SystemExit(subprocess.run(command + args, cwd=root, env=env).returncode)
