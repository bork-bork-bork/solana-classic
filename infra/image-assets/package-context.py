"""Package only named public source and locked dependencies for the image service."""
from pathlib import Path
import hashlib
import json
import shutil

root=Path(__file__).resolve().parents[2]
freeze=json.loads((root/'evidence/candidate-freeze.json').read_text())
for name,digest in freeze['coreFiles'].items():
    if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:
        raise SystemExit('Frozen source changed: '+name)
out=root/'.tools/image-service-context'
out.mkdir(exist_ok=True)
names=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml',
       'apps/api/package.json','apps/web/package.json','packages/config/package.json',
       'packages/chain/package.json','packages/config/src/index.ts','packages/chain/src/index.ts',
       'infra/image-assets/Dockerfile','infra/image-assets/server.ts',
       'infra/image-assets/package.json','infra/image-assets/package-lock.json']
for name in names:
    destination=out/name;destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(root/name,destination)
shutil.copy2(root/'infra/image-assets/Dockerfile',out/'Dockerfile')
if (out/'railway.json').exists():
    (out/'railway.json').unlink()
print(json.dumps({'context':str(out.relative_to(root)), 'files':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in names}}))
