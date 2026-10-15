"""One new loopback recovery attempt on the designated isolated worker.

This is deliberately not the canonical migration launcher. It never writes a
release gate, restarts a service, imports operator keys, or resets a ledger.
"""
from pathlib import Path, PurePosixPath
import argparse, base64, fcntl, gzip, hashlib, json, os, re, shutil, signal, socket, sqlite3, stat, subprocess, tarfile, time, urllib.request, uuid

PROJECT = '356bcb0b-49c4-4bd3-bf10-bff7db8f33fe'
ENVIRONMENT = '3367b373-2332-4702-8cce-c12b8f03949e'
WORKER = '29189101-226c-483b-a424-b8cd140abd80'
VOLUME = '285d8475-de1c-4af5-8705-65e03385a719'
CANONICAL = 'd0a1de40-bd9c-47eb-a7fc-477f1c55b2d6'
GENESIS = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'
BINARY = Path('/data/target/release/solana-test-validator')
BINARY_SHA = '3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a'
VERSION = 'solana-test-validator 3.0.14 (src:f516a892; feat:3604001754, client:Agave)'
ARCHIVE_SHA = '319c0e0e83941e5d59884df658b9f710645f61ee30f5a62bfeb11fc41fdbcaaa'
ARCHIVE_BYTES = 1055669530
RAW_SHA = '1d5a873e8b378555ad825d909c6ce6dd3338b928268664a5e8abee2446912a81'
RAW_BYTES = 3621519360
FREEZE_SHA = '55b668e56a946ec94f0195b03530aba23593bd71d7fd52493d5403b21882757f'
BASELINE_SHA = '5f951ad8e9bf360ccc7291bdf2342f8901b892d526ba9b75f90c533127429cd5'
APP_SHA = 'df6a6cef01852918cadf399921e65331fcd125a329c80a5cc0c82b6e842255af'
RPC_PORT, API_PORT, FAUCET_PORT, GOSSIP_PORT = 25899, 25910, 25901, 26000
DYNAMIC = range(26001, 26061)
MIN_FREE = 12 * 1024**3
MAX_MEMBERS, MAX_EXTRACTED, MAX_JSON = 100000, 6 * 1024**3, 4 * 1024**2

def require(condition, message):
    if not condition:
        raise ValueError(message)

def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def regular(path, maximum=None, private=False):
    require(not any(p.is_symlink() for p in Path(path).parents), 'Input parent symlink refused')
    item = Path(path).lstat()
    require(stat.S_ISREG(item.st_mode) and item.st_uid == os.getuid() and item.st_nlink == 1, 'Owner-controlled ordinary input required')
    require(not private or item.st_mode & 0o077 == 0, 'Private input permissions required')
    require(maximum is None or 0 < item.st_size <= maximum, 'Bounded input required')
    return item

def directory(path, private=True):
    current = Path(path)
    for ancestor in [current, *current.parents]:
        require(not ancestor.is_symlink(), 'Directory symlink refused')
    item = current.stat()
    require(stat.S_ISDIR(item.st_mode) and item.st_uid == os.getuid(), 'Owned directory required')
    require(not private or item.st_mode & 0o077 == 0, 'Private directory required')

def admit_environment(env):
    require(env.get('RAILWAY_PROJECT_ID') == PROJECT and env.get('RAILWAY_ENVIRONMENT_ID') == ENVIRONMENT, 'Wrong project or environment')
    require(env.get('RAILWAY_SERVICE_ID') == WORKER and env.get('RAILWAY_SERVICE_ID') != CANONICAL, 'Only designated separate worker is allowed')
    require(env.get('RAILWAY_VOLUME_MOUNT_PATH') == '/data', 'Worker data mount required')
    # Railway does not always supply a volume UUID in the process environment.
    # This exact UUID must be independently verified and staged in the review.
    require(not any(env.get(k) for k in ['SC_OPERATION', 'SC_MIGRATION_MODE', 'SC_QA_PREFUND']), 'Canonical operation modes must not be inherited')

def new_attempt(parent, attempt):
    require(str(uuid.UUID(attempt)) == attempt, 'Canonical UUID required')
    parent.mkdir(mode=0o700, exist_ok=True)
    directory(parent)
    target = parent / attempt
    target.mkdir(mode=0o700)  # Exclusive creation: retain all earlier attempts.
    return target

def validate_members(members):
    require(0 < len(members) <= MAX_MEMBERS and sum(m.size for m in members) <= MAX_EXTRACTED, 'Archive expansion bound exceeded')
    names = {}
    links = []
    for member in members:
        path = PurePosixPath(member.name)
        require(not path.is_absolute() and '..' not in path.parts and path.parts and path.parts[0] in ['ledger', 'app', 'operator', 'network.json'], 'Unsafe archive path')
        name = path.as_posix()
        require(name == member.name.rstrip('/') and name not in names and member.size >= 0, 'Noncanonical or duplicate member')
        names[name] = member
        if member.isdir() or member.isfile():
            continue
        if member.islnk():
            match = re.fullmatch(r'ledger/accounts/snapshot/[0-9]+/([0-9]+\.[0-9]+)', name)
            require(match is not None and member.linkname == 'ledger/accounts/run/' + match.group(1), 'Unsafe hardlink')
        elif member.issym():
            match = re.fullmatch(r'ledger/snapshots/([0-9]+)/accounts_hardlinks/account_path_0', name)
            require(match is not None and member.linkname == '/data/ledger/accounts/snapshot/' + match.group(1), 'Unsafe snapshot link')
            links.append(name)
        else:
            raise ValueError('Special archive member refused')
    for member in members:
        if member.islnk():
            require(member.linkname in names and names[member.linkname].isfile(), 'Missing hardlink target')
        if member.issym():
            target = member.linkname.removeprefix('/data/')
            require(target in names and names[target].isdir(), 'Missing snapshot target')
    require(not any(name.startswith(link + '/') for name in names for link in links), 'Archive write through symlink refused')
    return members

def verify_archive(path):
    require(regular(path, ARCHIVE_BYTES, True).st_size == ARCHIVE_BYTES and sha(path) == ARCHIVE_SHA, 'Wrong exact compressed archive')
    digest = hashlib.sha256(); total = 0
    with gzip.open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            total += len(chunk)
            require(total <= RAW_BYTES, 'Decompressed archive bound exceeded')
            digest.update(chunk)
    require(total == RAW_BYTES and digest.hexdigest() == RAW_SHA, 'Wrong exact stopped-writer archive')

def extract(path, destination):
    require(not destination.exists(), 'New extraction required')
    with tarfile.open(path, 'r:gz') as archive:
        members = validate_members(archive.getmembers())
        destination.mkdir(mode=0o700)
        selected = [m for m in members if m.name.split('/')[0] != 'operator']
        def parents(path):
            current = destination
            for part in path.relative_to(destination).parts:
                current /= part
                current.mkdir(mode=0o700, exist_ok=True)
        for member in selected:
            target = destination / member.name
            if member.isdir():
                parents(target)
            elif member.isfile():
                parents(target.parent)
                with archive.extractfile(member) as incoming, target.open('xb') as output:
                    shutil.copyfileobj(incoming, output)
                target.chmod(0o600)
                require(target.stat().st_size == member.size, 'Extracted byte length differs')
        for member in selected:
            target = destination / member.name
            if member.islnk():
                parents(target.parent)
                os.link(destination / member.linkname, target)
            elif member.issym():
                parents(target.parent)
                # Agave compares read_link() directly with its absolute account run paths.
                # Rebase only the validated archive link into this new private copy.
                target.symlink_to(destination.resolve() / member.linkname.removeprefix('/data/'))
    return destination

def app_inventory(app):
    result = {'tables': {}, 'files': {}}
    with sqlite3.connect('file:' + str(app / 'app.sqlite') + '?mode=ro', uri=True) as db:
        for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
            require(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', table), 'Unsafe table name')
            rows = db.execute('SELECT * FROM "' + table + '"').fetchall()
            raw = json.dumps(sorted(rows, key=lambda row: json.dumps(row, sort_keys=True)), sort_keys=True, separators=(',', ':')).encode()
            columns = [row[1] for row in db.execute('PRAGMA table_info("' + table + '")')]
            result['tables'][table] = {'columns': columns, 'rows': len(rows), 'sha256': hashlib.sha256(raw).hexdigest()}
    for path in sorted(app.rglob('*')):
        require(not path.is_symlink(), 'Application symlink refused')
        if path.is_file() and path.name not in ['app.sqlite', 'app.sqlite-wal', 'app.sqlite-shm']:
            result['files'][path.relative_to(app).as_posix()] = {'bytes': path.stat().st_size, 'sha256': sha(path)}
    return result

class RpcReadUnavailable(ValueError):
    pass

def rpc(method, params=None):
    require(method in ['getGenesisHash', 'getHealth', 'getSlot', 'getMultipleAccounts'], 'Launcher RPC is read-only')
    request = urllib.request.Request('http://127.0.0.1:' + str(RPC_PORT), data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params or []}).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=10) as response:
        payload = response.read(MAX_JSON + 1)
    require(len(payload) <= MAX_JSON, 'RPC response bound exceeded')
    value = json.loads(payload)
    require(value.get('id') == 1 and value.get('jsonrpc') == '2.0', 'Invalid private RPC response')
    if 'error' in value: raise RpcReadUnavailable('Private RPC not ready')
    return value['result']

PROTOCOL_DATA = {
    'C4fiSRaCLBH5juefcwm3chHurxmeZVqynFaemDxTU4Fm',
    'SysvarC1ock11111111111111111111111111111111',
    'SysvarRecentB1ockHashes11111111111111111111',
    'SysvarS1otHashes111111111111111111111111111',
    'SysvarS1otHistory11111111111111111111111111',
}
FEE_IDENTITY = 'B3apqZYKyJvn9cZ5rbGF74sKAjxfsWKcf6K5SgPYFHB7'

def account_fields(account):
    require(isinstance(account, dict) and type(account.get('executable')) is bool, 'Restored account missing')
    for field in ['lamports', 'rentEpoch']:
        require(type(account.get(field)) is int and 0 <= account[field] < 2**64, 'Exact account integer required')
    require(isinstance(account.get('owner'), str) and re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}', account['owner']), 'Account owner required')
    data = account.get('data')
    require(isinstance(data, list) and len(data) == 2 and data[1] == 'base64' and isinstance(data[0], str) and len(data[0]) <= 14000000, 'Bounded base64 account required')
    raw = base64.b64decode(data[0], validate=True)
    require(len(raw) <= 10485760 and base64.b64encode(raw).decode() == data[0], 'Noncanonical account data')
    return {'bytes': len(raw), 'dataSHA256': hashlib.sha256(raw).hexdigest(), 'owner': account['owner'], 'lamports': str(account['lamports']), 'rentEpoch': str(account['rentEpoch']), 'executable': account['executable']}

def compare_known_account(key, before, after):
    changes = {field for field in before if before[field] != after.get(field)}
    remaining = set(changes)
    if key in PROTOCOL_DATA:
        require(not before['executable'] and before['owner'] in ['Sysvar1111111111111111111111111111111111111', 'Vote111111111111111111111111111111111111111'], 'Invalid named protocol exception')
        remaining.discard('dataSHA256')
    if key == FEE_IDENTITY:
        require(before['owner'] == '11111111111111111111111111111111' and before['bytes'] == 0 and not before['executable'], 'Wrong fee identity')
        require(abs(int(after['lamports']) - int(before['lamports'])) <= 1000000000, 'Excessive vote fee movement')
        remaining.discard('lamports')
    require(not remaining, 'Restored archived account differs')
    return sorted(changes)

def verify_archived_accounts(baseline):
    require(baseline.get('genesis') == GENESIS and baseline.get('accountCount') == 2163 and len(baseline['accounts']) == 2163 and baseline.get('sha256') == 'e7661e7e8f731fc3e1133f95f2137677a007378f028877af921b47c3de860891', 'Exact complete archive bank required')
    addresses = sorted(baseline['accounts']); changes = []
    for offset in range(0, len(addresses), 100):
        keys = addresses[offset:offset+100]
        result = rpc('getMultipleAccounts', [keys, {'commitment': 'finalized', 'encoding': 'base64', 'minContextSlot': 348492}])
        require(type(result.get('context', {}).get('slot')) is int and result['context']['slot'] >= 348492 and len(result.get('value', [])) == len(keys), 'Bounded finalized account batch required')
        for key, value in zip(keys, result['value']):
            diff = compare_known_account(key, baseline['accounts'][key], account_fields(value))
            if diff: changes.append({'address': key, 'fields': diff})
    return {'archivedAccountsVerified': len(addresses), 'allArchivedUserAndProgrammeAccountsMatch': True, 'protocolChanges': changes, 'feeMovementReconciled': False, 'completeCurrentAccountInventoryClaimed': False, 'reason': 'All2163 archive addresses checked; named time/vote data and bounded validator fee balance may advance. No complete current bank enumeration or vote-fee reconciliation is claimed.'}

def command(dataset):
    return [str(BINARY), '--ledger', str(dataset / 'ledger'), '--rpc-port', str(RPC_PORT), '--faucet-port', str(FAUCET_PORT), '--gossip-port', str(GOSSIP_PORT), '--bind-address', '127.0.0.1', '--dynamic-port-range', '26001-26060', '--limit-ledger-size', '800000', '--quiet']

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--attempt', required=True); parser.add_argument('--ack', choices=['isolated-devnet-recovery'], required=True); args = parser.parse_args()
    os.umask(0o077); admit_environment(os.environ)
    recovery_parent = Path('/data/classic-recovery'); recovery_parent.mkdir(mode=0o700, exist_ok=True); directory(recovery_parent)
    lock = os.open(recovery_parent / '.worker-lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)  # Released on exit; serializes this launcher only.
    require(os.uname().sysname == 'Linux', 'Linux worker required')
    require(shutil.disk_usage('/data').free >= MIN_FREE, 'At least12GiB fresh worker headroom required')
    require(sha(BINARY) == BINARY_SHA and subprocess.check_output([str(BINARY), '--version'], text=True).strip() == VERSION, 'Source executable differs')
    for proc in Path('/proc').glob('[0-9]*'):
        try: first = (proc / 'cmdline').read_bytes().split(b'\0')[0]
        except OSError: continue
        require(not first.endswith(b'/solana-test-validator') and not first.endswith(b'/agave-validator'), 'Serialize worker validator jobs')
    for port in [RPC_PORT, RPC_PORT + 1, API_PORT, FAUCET_PORT, GOSSIP_PORT, *DYNAMIC]:
        for kind in [socket.SOCK_STREAM, socket.SOCK_DGRAM]:
            with socket.socket(socket.AF_INET, kind) as sock: sock.bind(('127.0.0.1', port))
    attempt_id = str(uuid.UUID(args.attempt)); require(attempt_id == args.attempt, 'Canonical UUID required')
    inputs = Path('/data/classic-recovery-inputs') / attempt_id; directory(inputs)
    for name, digest in [('candidate-freeze.json', FREEZE_SHA), ('official-inventory.json', BASELINE_SHA), ('app-baseline.json', APP_SHA)]:
        regular(inputs / name, MAX_JSON, True); require(sha(inputs / name) == digest, 'Exact retained input differs')
    regular(inputs / 'worker-review.json', 8192, True); review = json.loads((inputs / 'worker-review.json').read_text())
    require(review.get('workerServiceId') == WORKER and review.get('workerVolumeId') == VOLUME and review.get('approved') is True and review.get('attempt') == attempt_id, 'Actual worker service/volume review required')
    runtime = inputs / 'runtime'; directory(runtime)
    # Reuse only the existing worker's exact locked dependency graph. No install
    # or mutable workspace module source may differ from the reviewed runtime.
    for name in ['pnpm-lock.yaml', 'packages/chain/package.json', 'packages/config/package.json', 'packages/chain/src/index.ts', 'packages/config/src/index.ts']:
        require(sha(Path('/app') / name) == json.loads((inputs / 'candidate-freeze.json').read_text())['coreFiles'][name], 'Existing worker dependencies or shared module source differs')
    for name in ['node_modules', 'apps/api/node_modules', 'packages/chain/node_modules', 'packages/config/node_modules']:
        link = runtime / name; require(link.is_symlink() and link.resolve(strict=True) == (Path('/app') / name).resolve(strict=True), 'Exact existing worker dependency link required')
    freeze = json.loads((inputs / 'candidate-freeze.json').read_text())
    require(freeze['genesis'] == GENESIS, 'Wrong candidate genesis')
    for name, pin in freeze['runtime']['engineBuild']['binaries'].items():
        require(name in ['solana-test-validator', 'agave-validator', 'solana', 'solana-keygen'], 'Unknown pinned source executable')
        executable = BINARY.parent / name
        require(not executable.is_symlink() and executable.is_file() and executable.stat().st_size == pin['bytes'] and sha(executable) == pin['sha256'], 'Source executable artifact differs')
        require(subprocess.check_output([str(executable), '--version'], text=True, timeout=15).strip() == pin['version'], 'Source executable version differs')
    for name, digest in freeze['coreFiles'].items():
        require(not Path(name).is_absolute() and '..' not in Path(name).parts, 'Unsafe runtime source path')
        regular(runtime / name, MAX_JSON); require(sha(runtime / name) == digest, 'Exact runtime source differs')
    for name in ['launcher.py', 'verifier.mjs']:
        regular(inputs / name, MAX_JSON, True)
        require(review.get('driverFiles', {}).get(name) == sha(inputs / name), 'Reviewed recovery driver differs')
    require(sha(Path(__file__)) == review['driverFiles']['launcher.py'], 'Executed launcher differs')
    require(subprocess.check_output(['node', '--version'], text=True).strip() == 'v24.19.0', 'Pinned Node24.19.0 required')
    verify_archive(inputs / 'backup.tar.gz')
    root = new_attempt(Path('/data/classic-recovery'), attempt_id)
    state = {'schemaVersion': 1, 'attempt': attempt_id, 'scope': 'remote separate-worker loopback restored-devnet proof; not public mutation-path recovery', 'state': 'extracting', 'passed': False, 'backupCheckAccepted': False, 'canonicalNetworkChanged': False, 'operatorKeysExtracted': False}
    def save(): (root / 'attempt-private.json').write_text(json.dumps(state, indent=2) + '\n')
    save(); process = None
    try:
        dataset = extract(inputs / 'backup.tar.gz', root / 'restored')
        facts = json.loads((dataset / 'network.json').read_text()); require(facts['expectedGenesisHash'] == GENESIS and facts['hasMonetaryValue'] is False, 'Restored config differs')
        baseline_app = json.loads((inputs / 'app-baseline.json').read_text())
        require(app_inventory(dataset / 'app') == baseline_app, 'Full archived application manifest differs')
        state['archivedApplicationMatched'] = True; state['galleryRows'] = baseline_app['tables']['gallery']['rows']; save()
        with (root / 'validator-private.log').open('xb') as log:
            process = subprocess.Popen(command(dataset), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            until = time.monotonic() + 300
            while time.monotonic() < until:
                require(process.poll() is None, 'Copied validator exited; retain private diagnostics')
                try:
                    require(rpc('getGenesisHash') == GENESIS, 'Restored genesis mismatch')
                    if rpc('getHealth') == 'ok' and rpc('getSlot', [{'commitment': 'finalized'}]) >= 348492: break
                except (OSError, RpcReadUnavailable): pass
                time.sleep(2)
            else: raise ValueError('Restored finality readiness timed out')
            # No existing fixture ledger or canonical /data/ledger may be opened.
            maps = (Path('/proc') / str(process.pid) / 'maps').read_text()
            forbidden = ['/data/ledger', '/data/bridge-']
            require(not any(path in maps for path in forbidden), 'Forbidden ledger mapping')
            for fd in (Path('/proc') / str(process.pid) / 'fd').iterdir():
                try: target = os.readlink(fd)
                except OSError: continue
                require(not any(path in target for path in forbidden), 'Forbidden ledger file open')
            state['state'] = 'verifying'; save()
            account_proof = verify_archived_accounts(json.loads((inputs / 'official-inventory.json').read_text()))
            (root / 'account-proof.json').write_text(json.dumps(account_proof, indent=2) + '\n')
            with (root / 'verification-private.log').open('xb') as output:
                subprocess.run(['node', '--import', 'tsx', str(inputs / 'verifier.mjs'), attempt_id], cwd=runtime, stdout=output, stderr=subprocess.STDOUT, check=True, timeout=600)
            proof = json.loads((root / 'loopback-proof.json').read_text()); require(proof['passed'] is True and proof['backupCheckAccepted'] is False, 'Bounded verifier proof missing')
            require(app_inventory(dataset / 'app') == baseline_app, 'Application rows or immutable files changed during recovery reads/replay')
            state['state'] = 'passed'; state['passed'] = True
    except Exception:
        state['state'] = 'failed'; raise
    finally:
        if process is not None and process.poll() is None:
            process.send_signal(signal.SIGINT)
            try: process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait(); state['state'] = 'failed'; state['passed'] = False
        state['processStopped'] = process is None or process.poll() is not None
        state['returnCode'] = None if process is None else process.returncode
        state['applicationGracefulFlushVerified'] = False
        save()
    print(json.dumps({'passed': state['passed'], 'attempt': attempt_id, 'processStopped': state['processStopped'], 'backupCheckAccepted': False, 'canonicalNetworkChanged': False}))

if __name__ == '__main__': main()
