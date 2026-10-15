"""Reviewed start-command overlay for the separate existing recovery service.

Preserves old root data. Starts only a fresh restored ledger and the separately
reviewed HTTP wrapper. Never called by the canonical service or worker.
"""
from pathlib import Path
import argparse, fcntl, importlib.util, json, os, shutil, signal, socket, subprocess, time, uuid
spec=importlib.util.spec_from_file_location('recovery_core',Path(__file__).with_name('launcher.py'));core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
SERVICE='43fc867b-1105-423c-a901-84ec5cb9a46a';VOLUME='b3030354-8a36-4fed-939e-ea957fd65001'

def admit(review, env, attempt):
    core.require(env.get('RAILWAY_PROJECT_ID')==core.PROJECT and env.get('RAILWAY_ENVIRONMENT_ID')==core.ENVIRONMENT and env.get('RAILWAY_SERVICE_ID')==SERVICE and env.get('RAILWAY_VOLUME_MOUNT_PATH')=='/data','Actual separate recovery service required')
    core.require(not any(env.get(k) for k in ['SC_OPERATION','SC_MIGRATION_MODE','SC_QA_PREFUND']),'Old operation modes must be explicitly cleared for this reviewed new entrypoint')
    core.require(review.get('schemaVersion')==1 and review.get('scope')=='isolated-source-http-recovery-target' and review.get('approved') is True and review.get('providerAssignmentVerified') is True and review.get('attempt')==attempt,'Actual target review required')
    target=review.get('target',{});core.require(target.get('projectId')==core.PROJECT and target.get('environmentId')==core.ENVIRONMENT and target.get('serviceId')==SERVICE and target.get('volumeId')==VOLUME and target.get('api')=='https://recovery-drill-production.up.railway.app','Wrong target identity/volume/origin')
    core.require(review.get('freezeSha256')==core.FREEZE_SHA and review.get('archiveSha256')==core.ARCHIVE_SHA and review.get('rawArchiveSha256')==core.RAW_SHA,'Exact backup and freeze required')

def main():
    p=argparse.ArgumentParser();p.add_argument('attempt');p.add_argument('review_sha256');p.add_argument('--ack',choices=['isolated-source-http-recovery'],required=True);args=p.parse_args();os.umask(0o077)
    core.require(str(uuid.UUID(args.attempt))==args.attempt,'Canonical fresh UUID required')
    inputs=Path('/data/classic-recovery-inputs')/args.attempt;core.directory(inputs)
    review_path=inputs/'http-target-review.json';core.regular(review_path,65536,True);core.require(core.sha(review_path)==args.review_sha256,'Executed target review differs')
    review=json.loads(review_path.read_text());admit(review,os.environ,args.attempt)
    core.require(os.uname().sysname=='Linux' and shutil.disk_usage('/data').free>=core.MIN_FREE,'Linux target with at least12GiB post-upload headroom required')
    lock=os.open('/data/.isolated-http-recovery-lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    for proc in Path('/proc').glob('[0-9]*'):
        try:first=(proc/'cmdline').read_bytes().split(b'\0')[0]
        except OSError:continue
        core.require(not first.endswith(b'/solana-test-validator') and not first.endswith(b'/agave-validator'),'Prior target validator must already be stopped by reviewed provider deployment')
    for port in [3000,core.RPC_PORT,core.RPC_PORT+1,core.FAUCET_PORT,core.GOSSIP_PORT,*core.DYNAMIC]:
        for kind in [socket.SOCK_STREAM,socket.SOCK_DGRAM]:
            with socket.socket(socket.AF_INET,kind) as sock:sock.bind(('127.0.0.1',port))
    for name,sha in [('candidate-freeze.json',core.FREEZE_SHA),('official-inventory.json',core.BASELINE_SHA),('app-baseline.json',core.APP_SHA)]:
        core.regular(inputs/name,core.MAX_JSON,True);core.require(core.sha(inputs/name)==sha,'Exact private archive input differs')
    freeze=json.loads((inputs/'candidate-freeze.json').read_text());runtime=inputs/'runtime';core.directory(runtime)
    for name,sha in freeze['coreFiles'].items():core.regular(runtime/name,core.MAX_JSON);core.require(core.sha(runtime/name)==sha,'Exact runtime source differs')
    for name in ['http_start.py','launcher.py','http_runtime.mjs','http_contract.mjs']:
        core.regular(inputs/name,core.MAX_JSON,True);core.require(review.get('driverFiles',{}).get(name)==core.sha(inputs/name),'Reviewed executed driver differs')
    core.require(core.sha(Path(__file__))==review['driverFiles']['http_start.py'],'Actual startup driver differs')
    for name in ['pnpm-lock.yaml','packages/chain/package.json','packages/config/package.json','packages/chain/src/index.ts','packages/config/src/index.ts']:
        core.require(core.sha(Path('/app')/name)==freeze['coreFiles'][name],'Borrowed dependency graph/shared source differs')
    for name in ['node_modules','apps/api/node_modules','packages/chain/node_modules','packages/config/node_modules']:
        core.require((runtime/name).is_symlink() and (runtime/name).resolve(strict=True)==(Path('/app')/name).resolve(strict=True),'Only reviewed existing dependency links allowed')
    core.require(subprocess.check_output(['node','--version'],text=True).strip()=='v24.19.0','Pinned Node24.19.0 required')
    binaries=runtime/'.tools/agave-linux-v3.0.14/solana-release/bin'
    for name,pin in freeze['runtime']['engineBuild']['binaries'].items():
        binary=binaries/name;core.require(binary.is_file() and not binary.is_symlink() and binary.stat().st_size==pin['bytes'] and core.sha(binary)==pin['sha256'],'Exact public source binary differs')
        core.require(subprocess.check_output([str(binary),'--version'],text=True,timeout=15).strip()==pin['version'],'Source executable version differs')
    source_controls=Path('/data/migration')/freeze['runtime']['engineBuild']['migrationId'];core.require(not source_controls.exists() and not source_controls.is_symlink(),'Existing source controls retained; new review required')
    core.verify_archive(inputs/'backup.tar.gz')
    root=core.new_attempt(Path('/data/classic-recovery'),args.attempt)
    state={'schemaVersion':1,'attempt':args.attempt,'state':'extracting','passed':False,'targetServiceId':SERVICE,'targetVolumeId':VOLUME,'oldTargetDataRetained':True,'canonicalNetworkChanged':False,'operatorKeysExtracted':False}
    def save():(root/'attempt-private.json').write_text(json.dumps(state,indent=2)+'\n')
    save();validator=api=None
    def stop_requested(_signum,_frame):raise KeyboardInterrupt('Isolated stop requested')
    signal.signal(signal.SIGTERM,stop_requested)
    try:
        dataset=core.extract(inputs/'backup.tar.gz',root/'restored')
        core.require(core.app_inventory(dataset/'app')==json.loads((inputs/'app-baseline.json').read_text()),'Full617-row application/1992-file manifest differs')
        receipt={'schemaVersion':1,'passed':True,'attempt':args.attempt,'genesis':core.GENESIS,'archiveSha256':core.ARCHIVE_SHA,'rawArchiveSha256':core.RAW_SHA,'targetServiceId':SERVICE,'targetVolumeId':VOLUME,'freshAttemptDirectoryVerified':True,'oldTargetDataRetained':True,'allApplicationHashesMatch':True}
        with (inputs/'isolated-restore-receipt.json').open('x') as out:out.write(json.dumps(receipt)+'\n')
        command=core.command(dataset);command[0]=str(binaries/'solana-test-validator')
        # Upstream starts its faucet on an unspecified address even when RPC
        # is loopback. Refuse positive new grants using supported zero caps;
        # the archived UUID replay never invokes airdrop. No source patch.
        command+=['--faucet-per-request-sol-cap','0','--faucet-per-time-sol-cap','0']
        env=dict(os.environ);env['SC_VALIDATOR_BOOT_ID']=str(uuid.uuid4());env['SC_VALIDATOR_STARTED_AT']=__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
        with (root/'validator-private.log').open('xb') as log:validator=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=env)
        until=time.monotonic()+300
        while time.monotonic()<until:
            core.require(validator.poll() is None,'Isolated source validator exited; preserve diagnostics')
            try:
                core.require(core.rpc('getGenesisHash')==core.GENESIS,'Restored genesis changed')
                if core.rpc('getHealth')=='ok' and core.rpc('getSlot',[{'commitment':'finalized'}])>=348492:break
            except (OSError,core.RpcReadUnavailable):pass
            time.sleep(2)
        else:raise ValueError('Restored finalized readiness timed out')
        for proc_path in [Path('/proc')/str(validator.pid)/'maps', *list((Path('/proc')/str(validator.pid)/'fd').iterdir())]:
            try:value=os.readlink(proc_path) if proc_path.parent.name=='fd' else proc_path.read_text()
            except OSError:continue
            core.require('/data/ledger' not in value and '/data/app/' not in value,'Copied process opened original target dataset')
        with (root/'http-private.log').open('xb') as log:api=subprocess.Popen(['node','--import','tsx',str(inputs/'http_runtime.mjs'),args.attempt,args.review_sha256],cwd=runtime,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=env)
        state['state']='held-api-running';state['validatorBootId']=env['SC_VALIDATOR_BOOT_ID'];save()
        # External read-only bank/snapshot comparison and explicit approval are
        # separate operations. No automatic continuity pass or write release.
        while validator.poll() is None and api.poll() is None:time.sleep(2)
        raise ValueError('Isolated process exited; operator review required')
    finally:
        for process in [api,validator]:
            if process is not None and process.poll() is None:
                process.send_signal(signal.SIGINT)
                try:process.wait(timeout=30)
                except subprocess.TimeoutExpired:process.kill();process.wait()
        state['state']='stopped';state['processesStopped']=True;state['applicationGracefulFlushVerified']=False;save()
if __name__=='__main__':main()
