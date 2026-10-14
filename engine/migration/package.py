"""Prepare a named source-only network image context plus four public binaries.
Frozen repository files remain byte-for-byte unchanged. Generated API overlays
add a fail-closed maintenance gate and expose the checked engine provenance.
"""
from pathlib import Path
import datetime,hashlib,json,shutil,subprocess,uuid
ROOT=Path(__file__).resolve().parents[2]
freeze=json.loads((ROOT/'evidence/candidate-freeze.json').read_text())
for path,digest in freeze['coreFiles'].items():
    if hashlib.sha256((ROOT/path).read_bytes()).hexdigest()!=digest:raise SystemExit('Frozen file changed: '+path)
release=json.loads((ROOT/'evidence/source-built-binary-export.json').read_text())
archive=ROOT/'.tools/cutover-binaries/source-binaries.tar.gz'
if not release['passed'] or hashlib.sha256(archive.read_bytes()).hexdigest()!=release['archiveSha256']:raise SystemExit('Reviewed binary export required')
destination=ROOT/'.tools/source-runtime-candidate';destination.mkdir(exist_ok=False)
for path in freeze['coreFiles']:
    target=destination/path;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/path,target)
for path in ['tsconfig.json','docs/token-program-release.json','scripts/evidence.ts','scripts/release-check.ts','engine/migration/start.mjs','engine/migration/hold.mjs','engine/migration/hold.d.mts','engine/migration/Dockerfile','infra/explorer/block-reader.mjs']:
    target=destination/path;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/path,target)
shutil.copy2(archive,destination/'source-binaries.tar.gz')
release.update({'migrationId':str(uuid.uuid4()),'genesis':freeze['genesis'],'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
(destination/'engine/migration/release.json').write_text(json.dumps(release,indent=2)+'\n')
app=destination/'apps/api/src/app.ts';text=app.read_text();needle="  app.addHook('onRequest', async request => {";assert text.count(needle)==1
text="import { migrationHeld, isReadOnly } from '../../../engine/migration/hold.mjs';\n"+text
text=text.replace(needle,"  app.addHook('preHandler', async (request, reply) => { if (migrationHeld() && !isReadOnly(request)) return reply.code(503).send({ code: 'MIGRATION_READ_ONLY', message: 'The test network is in a reviewed migration window.' }); });\n"+needle);app.write_text(text)
runtime=destination/'apps/api/src/runtime.ts';text=runtime.read_text();needle='infra\\/RailwayCompatibility\\.Dockerfile';assert text.count(needle)==1
text=text.replace(needle,needle+'|engine\\/migration\\/(?:start\\.mjs|hold\\.mjs|release\\.json)|infra\\/explorer\\/block-reader\\.mjs')
needle="return { configured: true, genesis, sourceCommit:";assert text.count(needle)==1
text=text.replace(needle,"return { configured: true, genesis, engineBuild: JSON.parse(readFileSync(resolve(root, 'engine/migration/release.json'), 'utf8')), sourceCommit:");runtime.write_text(text)
manifest=json.loads((ROOT/'config/runtime-build.json').read_text())
paths=list(manifest['files'])+['engine/migration/start.mjs','engine/migration/hold.mjs','engine/migration/release.json','infra/explorer/block-reader.mjs']
files={path:hashlib.sha256((destination/path).read_bytes()).hexdigest() for path in paths}
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
manifest={'sourceCommit':commit,'coreSha256':hashlib.sha256(json.dumps(files,separators=(',',':')).encode()).hexdigest(),'files':files}
(destination/'config/runtime-build.json').write_text(json.dumps(manifest,indent=2)+'\n')
(destination/'Dockerfile').write_bytes((ROOT/'engine/migration/Dockerfile').read_bytes())
(destination/'.dockerignore').write_text('.git\n.railway\n.vercel\nnode_modules\n.env*\n')
proof={'schemaVersion':1,'scope':'prepared reproducible source-runtime image context; not deployed canonical runtime','passed':True,'migrationId':release['migrationId'],'sourceBuildRunId':release['runId'],'sourceCommit':commit,'coreSha256':manifest['coreSha256'],'files':{str(p.relative_to(destination)):hashlib.sha256(p.read_bytes()).hexdigest() for p in destination.rglob('*') if p.is_file()}}
(ROOT/'evidence/source-runtime-candidate-package.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'prepared':True,'migrationId':release['migrationId'],'files':len(proof['files']),'coreSha256':manifest['coreSha256']}))
