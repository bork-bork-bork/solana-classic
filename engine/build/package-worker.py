"""Produce a source-only upload context from committed files; never upload local runtime data."""
from pathlib import Path
import argparse, hashlib, io, json, subprocess, tarfile, uuid

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--run-id', default=str(uuid.uuid4()))
args = parser.parse_args()
run_id = str(uuid.UUID(args.run_id))
output = ROOT / '.tools' / ('engine-source-build-' + run_id)
output.mkdir(parents=True, exist_ok=False)

def git(*values):
    return subprocess.check_output(['git', '-C', str(ROOT), *values])

head = git('rev-parse', 'HEAD').decode().strip()
tree = git('rev-parse', 'HEAD:engine/agave').decode().strip()
if tree != 'a4c75a1781d4ca56e7325a39d0614e1faa26030d':
    raise SystemExit('Engine tree changed; review the source pin and worker before packaging.')
source_archive = io.BytesIO(git('archive', 'HEAD:engine/agave'))
with tarfile.open(fileobj=source_archive) as source, tarfile.open(output / 'source.tar', 'w') as target:
    for member in source.getmembers():
        member.mtime = 0
        member.uid = member.gid = 0
        member.uname = member.gname = ''
        member.pax_headers = {}
        target.addfile(member, source.extractfile(member) if member.isfile() else None)
files = {}
for line in git('ls-tree', '-r', 'HEAD:engine/agave').decode().splitlines():
    metadata, relative = line.split('\t')
    mode, kind, blob = metadata.split()
    if kind != 'blob':
        raise SystemExit('External Git dependency needs explicit review.')
    files[relative] = {'mode': mode, 'sha256': hashlib.sha256(git('cat-file', 'blob', blob)).hexdigest()}
manifest = {'schemaVersion': 1, 'runId': run_id, 'sourceRepositoryCommit': head, 'upstreamCommit': 'f516a8927c76c07f0ebc54ca7a4ce8b2046eee86', 'upstreamTree': tree, 'files': files}
(output / 'source-manifest.json').write_text(json.dumps(manifest, sort_keys=True) + '\n')
for relative in ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json']:
    (output / relative).write_bytes(git('show', 'HEAD:' + relative))
with tarfile.open(fileobj=io.BytesIO(git('archive', 'HEAD', 'apps', 'packages'))) as archive:
    archive.extractall(output, filter='data')
build = output / 'build'
build.mkdir()
for name in ['Dockerfile', 'worker.py', 'isolation-smoke.ts']:
    (build / name).write_bytes(git('show', 'HEAD:engine/build/' + name))
(output / 'railway.json').write_bytes(git('show', 'HEAD:engine/build/railway.json'))
(output / 'token-program-release.json').write_bytes(git('show', 'HEAD:docs/token-program-release.json'))
print(json.dumps({'context': str(output.relative_to(ROOT)), 'runId': run_id, 'sourceRepositoryCommit': head, 'sourceFiles': len(files), 'sourceManifestSha256': hashlib.sha256((output / 'source-manifest.json').read_bytes()).hexdigest(), 'workerSha256': hashlib.sha256((build / 'worker.py').read_bytes()).hexdigest()}))
