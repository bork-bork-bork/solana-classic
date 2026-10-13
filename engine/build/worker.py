"""Persistent source-build worker. Public API exposes bounded progress, never logs or keys."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import datetime, hashlib, json, os, platform, re, shutil, signal, subprocess, threading, time, urllib.request

APP = Path('/app')
DATA = Path('/data')
EXPECTED_COMMIT = 'f516a8927c76c07f0ebc54ca7a4ce8b2046eee86'
EXPECTED_TREE = 'a4c75a1781d4ca56e7325a39d0614e1faa26030d'
CANONICAL_GENESIS = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'
PUBLIC_GENESIS = {'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'}
STEPS = ['source', 'toolchain', 'compile', 'upstream-tests', 'program', 'isolated-start', 'transactions', 'restart', 'cold-restore']
LOCK = threading.RLock()
STATE = {}
ACTIVE = None
VALIDATOR = None

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        while block := f.read(1024 * 1024):
            h.update(block)
    return h.hexdigest()

def save(**fields):
    with LOCK:
        STATE.update(fields)
        STATE['updatedAt'] = utc()
        payload = json.dumps(STATE, indent=2)
        target = Path(STATE['runDirectory']) / 'progress.json'
        temporary = target.with_suffix('.tmp')
        temporary.write_text(payload)
        temporary.chmod(0o600)
        temporary.replace(target)

def check_source(manifest):
    if manifest['upstreamCommit'] != EXPECTED_COMMIT or manifest['upstreamTree'] != EXPECTED_TREE or len(manifest['files']) != 2215:
        raise RuntimeError('Source manifest does not bind the reviewed upstream tree.')
    observed = {str(p.relative_to(APP / 'source')) for p in (APP / 'source').rglob('*') if p.is_file() or p.is_symlink()}
    if observed != set(manifest['files']):
        raise RuntimeError('Missing or additional engine source files.')
    for relative, item in manifest['files'].items():
        path = APP / 'source' / relative
        if item['mode'] == '120000':
            if not path.is_symlink() or hashlib.sha256(os.readlink(path).encode()).hexdigest() != item['sha256']:
                raise RuntimeError('Upstream symbolic link changed.')
        elif not path.is_file() or path.is_symlink() or sha(path) != item['sha256'] or bool(path.stat().st_mode & 0o111) != (item['mode'] == '100755'):
            raise RuntimeError('Engine source bytes or executable mode changed.')

def run(command, step, cwd=None, timeout=18_000, extra_env=None):
    global ACTIVE
    env = os.environ.copy()
    env.update(extra_env or {})
    log = Path(STATE['runDirectory']) / (step + '.log')
    start = time.monotonic()
    with log.open('ab') as output:
        process = subprocess.Popen(command, cwd=cwd or APP / 'source', env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        ACTIVE = process
        def deadline():
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        timer = threading.Timer(timeout, deadline)
        timer.start()
        try:
            for line in iter(process.stdout.readline, b''):
                output.write(line); output.flush()
                text = line.decode('utf-8', 'replace').strip()
                match = re.match(r'(?:Compiling|Checking) ([a-zA-Z0-9_-]+) v([0-9.]+)', text)
                if match:
                    save(lastActivityAt=utc(), lastPackage=match[1][:80], cargoPackagesStarted=STATE.get('cargoPackagesStarted', 0) + 1)
                if text.startswith('test result:'):
                    summaries = STATE.get('testSummaries', [])[-15:] + [text[:240]]
                    save(testSummaries=summaries, lastActivityAt=utc())
            code = process.wait(timeout=30)
            if code != 0:
                raise RuntimeError('Step ' + step + ' exited ' + str(code) + '; preserved private diagnostic log requires review.')
        finally:
            timer.cancel()
            ACTIVE = None
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
    return round(time.monotonic() - start, 3)

def step(name, operation):
    steps = STATE['steps'].copy()
    steps[name] = {'state': 'running', 'startedAt': utc()}
    save(state='running', phase=name, steps=steps, lastActivityAt=utc())
    start = time.monotonic()
    result = operation()
    steps = STATE['steps'].copy()
    steps[name] = {**steps[name], 'state': 'passed', 'completedAt': utc(), 'durationSeconds': round(time.monotonic() - start, 3)}
    save(steps=steps, lastActivityAt=utc())
    return result

def rpc(method, params=None):
    request = urllib.request.Request('http://127.0.0.1:18899', data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params or []}).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=8) as response:
        body = json.load(response)
    if 'error' in body:
        raise RuntimeError('Isolated RPC rejected request.')
    return body['result']

def admit_genesis(genesis):
    if not isinstance(genesis, str) or not re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}', genesis) or genesis in PUBLIC_GENESIS or genesis == CANONICAL_GENESIS:
        raise RuntimeError('Only a fresh independent staging genesis is permitted.')
    return genesis

def start_validator(ledger, initial=False):
    global VALIDATOR
    command = ['/data/target/release/solana-test-validator', '--ledger', str(ledger), '--rpc-port', '18899', '--faucet-port', '18900', '--bind-address', '127.0.0.1', '--dynamic-port-range', '19000-19050', '--limit-ledger-size', '50000', '--quiet']
    if initial:
        command += ['--bpf-program', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', str(Path(STATE['runDirectory']) / 'token2022.so')]
    output = (Path(STATE['runDirectory']) / 'validator-private.log').open('ab')
    VALIDATOR = subprocess.Popen(command, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
    until = time.monotonic() + 180
    while time.monotonic() < until:
        if VALIDATOR.poll() is not None:
            raise RuntimeError('Source-built isolated validator exited; preserved diagnostic log requires review.')
        try:
            raw_genesis = rpc('getGenesisHash')
        except (OSError, ValueError, RuntimeError):
            time.sleep(2)
            continue
        genesis = admit_genesis(raw_genesis)
        if STATE.get('isolatedGenesis') and genesis != STATE['isolatedGenesis']:
            raise RuntimeError('Isolated genesis changed across recovery.')
        try:
            healthy = rpc('getHealth') == 'ok'
        except (OSError, ValueError, RuntimeError):
            healthy = False
        if healthy:
            save(isolatedGenesis=genesis)
            return genesis
        time.sleep(2)
    raise RuntimeError('Isolated validator readiness timed out.')

def stop_validator():
    global VALIDATOR
    if VALIDATOR and VALIDATOR.poll() is None:
        os.killpg(VALIDATOR.pid, signal.SIGINT)
        try:
            VALIDATOR.wait(timeout=60)
        except subprocess.TimeoutExpired:
            os.killpg(VALIDATOR.pid, signal.SIGKILL)
            VALIDATOR.wait()
            raise RuntimeError('Isolated validator did not stop gracefully; recovery test not accepted.')
    VALIDATOR = None

def smoke(mode='create'):
    env = {'SC_ENGINE_EXPECTED_GENESIS': STATE['isolatedGenesis'], 'SC_ENGINE_RECEIPT': str(Path(STATE['runDirectory']) / 'smoke.json'), 'SC_ENGINE_SMOKE_MODE': mode}
    run(['node', '--import', 'tsx', '/app/build/isolation-smoke.ts'], 'transactions-' + mode, cwd=APP, timeout=420, extra_env=env)

def program():
    manifest = json.loads((APP / 'token-program-release.json').read_text())
    asset = next(a for a in manifest['assets'] if a['name'] == 'spl_token_2022.so')
    url = 'https://github.com/solana-program/token-2022/releases/download/program%40v10.0.0/spl_token_2022.so'
    expected = 'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68'
    if asset['browser_download_url'] != url or asset['digest'] != 'sha256:' + expected or asset['size'] != 506896:
        raise RuntimeError('Token-2022 manifest changed.')
    with urllib.request.urlopen(url, timeout=40) as response:
        data = response.read(506897)
    if len(data) != 506896 or hashlib.sha256(data).hexdigest() != expected or not data.startswith(b'\x7fELF'):
        raise RuntimeError('Token-2022 program checksum changed.')
    target = Path(STATE['runDirectory']) / 'token2022.so'
    target.write_bytes(data)
    save(tokenProgramSha256=expected)

def toolchain():
    rust = subprocess.check_output(['rustc', '--version'], text=True).strip()
    cargo = subprocess.check_output(['cargo', '--version'], text=True).strip()
    node = subprocess.check_output(['node', '--version'], text=True).strip()
    if not rust.startswith('rustc 1.86.0 ') or node != 'v24.19.0' or platform.machine() != 'x86_64':
        raise RuntimeError('Pinned Linux toolchain does not match.')
    save(toolchain={'rust': rust, 'cargo': cargo, 'node': node, 'architecture': platform.machine(), 'cargoJobs': 2, 'releaseLto': 'thin'})

def build():
    run(['cargo', 'build', '--release', '--locked', '-p', 'agave-validator', '-p', 'solana-cli', '-p', 'solana-keygen', '--bin', 'agave-validator', '--bin', 'solana-test-validator', '--bin', 'solana', '--bin', 'solana-keygen'], 'compile')
    binaries = {}
    for name in ['agave-validator', 'solana-test-validator', 'solana', 'solana-keygen']:
        path = Path('/data/target/release') / name
        version = subprocess.check_output([str(path), '--version'], text=True).strip()
        if '3.0.14' not in version:
            raise RuntimeError('Source-built binary version does not match.')
        binaries[name] = {'sha256': sha(path), 'bytes': path.stat().st_size, 'version': version[:240]}
    save(binaries=binaries)

def workflow(manifest):
    try:
        step('source', lambda: check_source(manifest))
        step('toolchain', toolchain)
        step('compile', build)
        step('upstream-tests', lambda: run(['cargo', 'test', '--release', '--locked', '-p', 'solana-svm', '-p', 'solana-genesis-utils', '--lib', '--', '--test-threads=2'], 'upstream-tests', timeout=7200))
        step('program', program)
        ledger = Path(STATE['runDirectory']) / 'ledger'
        step('isolated-start', lambda: start_validator(ledger, initial=True))
        step('transactions', smoke)
        def restart():
            stop_validator(); start_validator(ledger); smoke('verify')
        step('restart', restart)
        def restore():
            stop_validator()
            backup = Path(STATE['runDirectory']) / 'cold-backup'
            restored = Path(STATE['runDirectory']) / 'restored-ledger'
            shutil.copytree(ledger, backup, symlinks=True)
            shutil.copytree(backup, restored, symlinks=True)
            start_validator(restored); smoke('verify'); stop_validator()
        step('cold-restore', restore)
        save(state='completed', phase='review', passed=True, completedAt=utc(), message='Source build and bounded isolated tests passed. Production cutover and a new 24-hour run still require separate acceptance.')
    except Exception:
        phase = STATE.get('phase', 'source')
        steps = STATE.get('steps', {}).copy()
        steps[phase] = {**steps.get(phase, {}), 'state': 'failed', 'completedAt': utc()}
        save(state='failed', passed=False, phase=phase, steps=steps, message='Build/test step failed; private diagnostic log retained for review. No running network was changed.')
        try:
            stop_validator()
        except Exception:
            pass

def public_state():
    with LOCK:
        keys = ['schemaVersion', 'runId', 'startedAt', 'updatedAt', 'state', 'phase', 'passed', 'completedAt', 'upstreamCommit', 'upstreamTree', 'sourceRepositoryCommit', 'sourceManifestSha256', 'workerSha256', 'lastActivityAt', 'lastPackage', 'cargoPackagesStarted', 'steps', 'toolchain', 'binaries', 'isolatedGenesis', 'tokenProgramSha256', 'testSummaries', 'message']
        value = {key: STATE[key] for key in keys if key in STATE}
        value['at'] = utc()
        value['processAlive'] = ACTIVE is not None and ACTIVE.poll() is None
        value['productionNetworkChanged'] = False
        value['cutoverAccepted'] = False
        return value

class Handler(BaseHTTPRequestHandler):
    def respond(self, code, body):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = urlsplit(self.path)
        if path.query or path.path not in {'/health', '/api/build'}:
            return self.respond(404, {'error': 'Not found'})
        return self.respond(200, {'ok': True, 'scope': 'isolated source-build worker'} if path.path == '/health' else public_state())

    def do_POST(self):
        return self.respond(405, {'error': 'Read-only endpoint'})
    do_PUT = do_DELETE = do_PATCH = do_POST
    def log_message(self, *_args):
        pass

def main():
    os.umask(0o077)
    manifest = json.loads((APP / 'source-manifest.json').read_text())
    if not re.fullmatch(r'[a-f0-9-]{36}', manifest['runId']):
        raise RuntimeError('Invalid explicit build run ID.')
    DATA.mkdir(exist_ok=True)
    directory = DATA / 'runs' / manifest['runId']
    directory.mkdir(parents=True, exist_ok=True)
    attempt = DATA / 'attempt.json'
    if attempt.exists():
        claimed = json.loads(attempt.read_text())
        if claimed['runId'] != manifest['runId']:
            raise RuntimeError('Existing isolated attempt must be retained and reviewed before any new run.')
        saved = directory / 'progress.json'
        STATE.update(json.loads(saved.read_text()) if saved.exists() else {'state': 'interrupted', 'steps': {}})
        STATE['runDirectory'] = str(directory)
        if STATE['state'] not in {'completed', 'failed', 'interrupted'}:
            save(state='interrupted', passed=False, message='Worker restarted. Existing attempt retained; no automatic compiler/test replay.')
    else:
        with attempt.open('x') as output:
            json.dump({'runId': manifest['runId'], 'startedAt': utc()}, output)
        STATE.update({'schemaVersion': 1, 'runId': manifest['runId'], 'runDirectory': str(directory), 'startedAt': utc(), 'state': 'starting', 'phase': 'source', 'passed': False, 'upstreamCommit': manifest['upstreamCommit'], 'upstreamTree': manifest['upstreamTree'], 'sourceRepositoryCommit': manifest['sourceRepositoryCommit'], 'sourceManifestSha256': sha(APP / 'source-manifest.json'), 'workerSha256': sha(APP / 'build/worker.py'), 'cargoPackagesStarted': 0, 'steps': {name: {'state': 'queued'} for name in STEPS}})
        save()
        threading.Thread(target=workflow, args=(manifest,), daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '3000'))), Handler).serve_forever()

if __name__ == '__main__':
    main()
