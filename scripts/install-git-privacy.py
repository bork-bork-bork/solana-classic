#!/usr/bin/env python3
"""Install repository-scoped team identity and privacy hooks."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
for key,value in [('user.name','Solana Classic Labs'),('user.email',''),('user.useConfigOnly','true'),('core.hooksPath','.githooks')]:
 subprocess.run(['git','config','--local',key,value],cwd=root,check=True)
print('Repository team identity and privacy hooks installed.')
