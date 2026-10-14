"""Official -> source -> official recovery drill on a fresh private staging ledger.

Run only inside the existing isolated build worker. Never imports a live ledger
or key. Retains both pre/post-switch receipts and all failures in a new directory.
"""
import datetime, hashlib, importlib.util, json, os, shutil, socket, subprocess
import signal, tarfile, time, urllib.request, uuid
from pathlib import Path

PROJECT = '356bcb0b-49c4-4bd3-bf10-bff7db8f33fe'
SERVICE = '29189101-226c-483b-a424-b8cd140abd80'
BUILD_RUN = '40de48b7-6963-429b-ae3e-81a610d81b7d'
WORKER_SHA = 'ac5937cba2a39336f847f2ce5443ed729146a07462c66074ff448c38d6e995ab'
OFFICIAL_SHA = '80f3bc0e3fa6a3090e69bafbfe00b249eaa655c5874ac83aebb6acdb157140ab'
SOURCE_SHA = '3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a'
ARCHIVE_SHA = '65614325423316a48f57f1ceeaa91ca78f4516e165e305b38c01873cf8c6b8b4'
ARCHIVE_SIZE = 214232615

def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        while chunk := f.read(1048576): h.update(chunk)
    return h.hexdigest()

def main():
    if os.environ.get('RAILWAY_PROJECT_ID') != PROJECT or os.environ.get('RAILWAY_SERVICE_ID') != SERVICE:
        raise RuntimeError('Only the isolated compiler service may run this drill.')
    if digest('/app/build/worker.py') != WORKER_SHA:
        raise RuntimeError('Reviewed worker source changed.')
    result = json.loads((Path('/data/runs') / BUILD_RUN / 'progress.json').read_text())
    if result['state'] != 'completed' or result['passed'] is not True:
        raise RuntimeError('Source build has not passed.')
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1',18899)) == 0:
            raise RuntimeError('Staging RPC already has a writer; refusing to touch it.')
    os.umask(0o077)
    directory = Path('/data/runs') / str(uuid.uuid4()); directory.mkdir()
    proof = {'schemaVersion':1,'scope':'remote fresh isolated official-to-source migration and rollback rehearsal; no canonical ledger or app database copied',
             'passed':False,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'runId':directory.name,'sourceBuildRunId':BUILD_RUN,'officialBinarySha256':OFFICIAL_SHA,
             'sourceBinarySha256':SOURCE_SHA,'productionNetworkChanged':False,'steps':[]}
    proof_path = directory / 'migration-rehearsal.json'
    def record(name, state='passed'):
        proof['steps'].append({'name':name,'state':state,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
        proof_path.write_text(json.dumps(proof,indent=2)+'\n')
    validator = None
    try:
        cache = Path('/data/migration-artifacts'); cache.mkdir(exist_ok=True)
        archive = cache / 'official-v3.0.14.tar.bz2'
        official = cache / 'official-solana-test-validator'
        if not official.exists():
            if not archive.exists():
                request = urllib.request.Request('https://github.com/anza-xyz/agave/releases/download/v3.0.14/solana-release-x86_64-unknown-linux-gnu.tar.bz2',headers={'User-Agent':'solana-classic-reviewed-rehearsal'})
                with urllib.request.urlopen(request,timeout=120) as response, archive.with_suffix('.part').open('xb') as out:
                    shutil.copyfileobj(response,out,1048576)
                archive.with_suffix('.part').rename(archive)
            if archive.stat().st_size != ARCHIVE_SIZE or digest(archive) != ARCHIVE_SHA:
                raise RuntimeError('Official archive integrity failed.')
            with tarfile.open(archive,'r:bz2') as source:
                member = source.getmember('solana-release/bin/solana-test-validator')
                if not member.isfile(): raise RuntimeError('Official executable is not a regular file.')
                with source.extractfile(member) as incoming, official.open('xb') as out: shutil.copyfileobj(incoming,out)
            official.chmod(0o700)
        source = Path('/data/target/release/solana-test-validator')
        if digest(official) != OFFICIAL_SHA or digest(source) != SOURCE_SHA:
            raise RuntimeError('Reviewed executable bytes changed.')
        record('verified-both-executable-hashes')
        spec = importlib.util.spec_from_file_location('reviewed_worker','/app/build/worker.py')
        worker = importlib.util.module_from_spec(spec); spec.loader.exec_module(worker)
        worker.STATE.update({'runDirectory':str(directory),'steps':{},'state':'rehearsal'})
        program = Path('/data/runs') / BUILD_RUN / 'token2022.so'
        if digest(program) != 'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68':
            raise RuntimeError('Token program integrity failed.')
        ledger = directory / 'ledger'
        def stop():
            nonlocal validator
            if validator and validator.poll() is None:
                validator.send_signal(signal.SIGINT)
                try: validator.wait(timeout=60)
                except subprocess.TimeoutExpired:
                    validator.kill(); validator.wait(); raise RuntimeError('Staging writer did not stop cleanly.')
            validator = None
        def start(binary, path, initial=False):
            nonlocal validator
            command = [str(binary),'--ledger',str(path),'--rpc-port','18899','--faucet-port','18900','--bind-address','127.0.0.1','--dynamic-port-range','19000-19050','--limit-ledger-size','50000','--quiet']
            if initial: command += ['--bpf-program','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',str(program)]
            with (directory / 'validator-private.log').open('ab') as log:
                validator = subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            until = time.monotonic()+180
            while time.monotonic()<until:
                if validator.poll() is not None: raise RuntimeError('Isolated startup failed; retained private log requires review.')
                try:
                    genesis = worker.admit_genesis(worker.rpc('getGenesisHash'))
                    if worker.STATE.get('isolatedGenesis') and worker.STATE['isolatedGenesis'] != genesis:
                        raise RuntimeError('Staging genesis changed across migration.')
                    if worker.rpc('getHealth') == 'ok':
                        worker.STATE['isolatedGenesis']=genesis; proof['isolatedGenesis']=genesis; return
                except (OSError,ValueError): pass
                except RuntimeError as e:
                    if 'genesis' in str(e).lower() or 'permitted' in str(e).lower(): raise
                time.sleep(2)
            raise RuntimeError('Isolated startup timed out.')
        def verify_all():
            for receipt in ['before-switch.json','after-switch.json']:
                if (directory / receipt).exists():
                    shutil.copyfile(directory / receipt,directory / 'smoke.json'); worker.smoke('verify')
        start(official,ledger,initial=True); worker.smoke(); shutil.copyfile(directory/'smoke.json',directory/'before-switch.json'); record('official-created-native-meme-nft-state'); stop()
        start(source,ledger); verify_all(); record('source-preserved-official-state')
        worker.smoke(); shutil.copyfile(directory/'smoke.json',directory/'after-switch.json'); record('source-created-new-native-meme-nft-state'); stop()
        start(official,ledger); verify_all(); record('rollback-official-preserved-before-and-after-state'); stop()
        start(source,ledger); verify_all(); record('source-reentry-preserved-before-and-after-state'); stop()
        worker.copy_cold_ledger(ledger,directory/'cold-backup'); worker.copy_cold_ledger(directory/'cold-backup',directory/'restored-ledger')
        start(official,directory/'restored-ledger'); verify_all(); record('official-cold-restore-preserved-before-and-after-state'); stop()
        start(source,directory/'restored-ledger'); verify_all(); record('source-cold-restore-preserved-before-and-after-state'); stop()
        proof['passed']=True; proof['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat(); record('completed')
    except Exception:
        record('failed','failed'); raise
    finally:
        if validator and validator.poll() is None:
            validator.send_signal(signal.SIGINT)
            try: validator.wait(timeout=60)
            except subprocess.TimeoutExpired: validator.kill(); validator.wait()
    print(json.dumps(proof))

if __name__ == '__main__': main()
