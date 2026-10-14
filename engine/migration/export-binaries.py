"""Export only the four reviewed public executables over authenticated Railway SSH."""
import base64, hashlib, json, os, subprocess, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = '40de48b7-6963-429b-ae3e-81a610d81b7d'
review = json.loads((ROOT/'evidence/engine-source-build-snapshot-path-retry.json').read_text())['progress']
if review['runId'] != RUN or review['passed'] is not True or review['state'] != 'completed':
    raise SystemExit('Reviewed source-build result required.')
binaries = review['binaries']
if set(binaries) != {'agave-validator','solana-test-validator','solana','solana-keygen'}:
    raise SystemExit('Unexpected executable inventory.')
destination = ROOT/'.tools/cutover-binaries'; destination.mkdir(exist_ok=True)
archive = destination/'source-binaries.tar.gz'
if archive.exists(): raise SystemExit('Existing export retained; verify it rather than overwrite it.')
code = """
import base64,hashlib,json,os,tarfile
from pathlib import Path
assert os.environ.get('RAILWAY_SERVICE_ID')=='29189101-226c-483b-a424-b8cd140abd80'
expected=json.loads(EXPECTED)
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while b:=f.read(1048576):h.update(b)
 return h.hexdigest()
result=json.loads(Path('/data/runs/RUN/progress.json').read_text())
assert result['state']=='completed' and result['passed'] is True and result['binaries']==expected
for name,item in expected.items():
 p=Path('/data/target/release')/name
 assert p.is_file() and not p.is_symlink() and p.stat().st_size==item['bytes'] and digest(p)==item['sha256']
folder=Path('/data/migration-artifacts');folder.mkdir(exist_ok=True)
archive=folder/'source-binaries-RUN.tar.gz'
if not archive.exists():
 with tarfile.open(archive,'w:gz') as out:
  for name in sorted(expected):out.add(Path('/data/target/release')/name,arcname=name,recursive=False)
 archive.chmod(0o600)
print('SC_ARTIFACT_START '+json.dumps({'bytes':archive.stat().st_size,'sha256':digest(archive)}),flush=True)
with archive.open('rb') as f:
 while data:=f.read(768):print(base64.b64encode(data).decode())
print('SC_ARTIFACT_END',flush=True)
""".replace('EXPECTED',repr(json.dumps(binaries))).replace('RUN',RUN)
command = ['/opt/homebrew/bin/railway','ssh','-p','356bcb0b-49c4-4bd3-bf10-bff7db8f33fe','-s','29189101-226c-483b-a424-b8cd140abd80','-e','3367b373-2332-4702-8cce-c12b8f03949e','--','python3','-c',code]
process = subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
metadata = None; complete = False; size = 0; h = hashlib.sha256()
partial = archive.with_suffix('.part')
with partial.open('xb') as out:
    os.chmod(partial,0o600)
    for line in process.stdout:
        line = line.strip()
        if line.startswith('SC_ARTIFACT_START '):
            if metadata is not None: raise RuntimeError('Duplicate artifact frame.')
            metadata=json.loads(line.split(' ',1)[1]); print('Receiving reviewed public executables.',flush=True)
            if not 0 < metadata['bytes'] < 256_000_000: raise RuntimeError('Artifact exceeds bound.')
        elif line == 'SC_ARTIFACT_END': complete=True; break
        elif metadata is not None:
            chunk=base64.b64decode(line,validate=True);size+=len(chunk)
            if size>metadata['bytes']: raise RuntimeError('Artifact exceeds declared size.')
            out.write(chunk);h.update(chunk)
process.stdout.close(); errors=process.stderr.read(); code=process.wait()
if code or not complete or size!=metadata['bytes'] or h.hexdigest()!=metadata['sha256']:
    raise SystemExit('Authenticated executable export failed; partial file retained.')
with tarfile.open(partial,'r:gz') as source:
    members=source.getmembers()
    if len(members)!=4 or {m.name for m in members}!=set(binaries): raise RuntimeError('Unexpected archive contents.')
    for member in members:
        if not member.isfile() or member.size!=binaries[member.name]['bytes']: raise RuntimeError('Invalid executable member.')
        incoming=source.extractfile(member);digest=hashlib.sha256()
        while chunk:=incoming.read(1048576): digest.update(chunk)
        if digest.hexdigest()!=binaries[member.name]['sha256']: raise RuntimeError('Executable digest mismatch.')
partial.rename(archive)
manifest={'schemaVersion':1,'scope':'authenticated export of four public source-built binaries only; no ledger or key material',
          'passed':True,'runId':RUN,'archiveBytes':size,'archiveSha256':h.hexdigest(),'binaries':binaries,
          'upstreamCommit':review['upstreamCommit'],'upstreamTree':review['upstreamTree'],
          'sourceRepositoryCommit':review['sourceRepositoryCommit'],'workerSha256':review['workerSha256'],
          'sourceManifestSha256':review['sourceManifestSha256']}
(ROOT/'evidence/source-built-binary-export.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'passed':True,'archiveBytes':size,'archiveSha256':h.hexdigest(),'executables':4}))
