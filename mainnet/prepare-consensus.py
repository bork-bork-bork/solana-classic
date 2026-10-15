#!/usr/bin/env python3
"""Prepare a fresh synthetic genesis bundle only after full host admission.

Default is read-only admission. Never starts validators or activates a network.
"""
from pathlib import Path
import argparse,datetime,hashlib,importlib.util,json,os,re,signal,stat,subprocess
_spec=importlib.util.spec_from_file_location('consensus',Path(__file__).with_name('consensus.py'));c=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(c)
_process_spec=importlib.util.spec_from_file_location('offline_process',Path(__file__).with_name('offline_process.py'));offline_process=importlib.util.module_from_spec(_process_spec);_process_spec.loader.exec_module(offline_process)
BASE=Path('/data/mainnet-consensus-v2')
TOTAL=1_000_000_000_000
CANONICAL_SERVICE='d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6'

def check_tools(directory):
 for manifest in ['consensus-audit-artifact.json','ledger-tool-artifact.json']:
  artifact=json.loads(Path(__file__).with_name(manifest).read_text());binary=directory/artifact['name']
  if binary.is_symlink() or not binary.is_file() or not os.access(binary,os.X_OK) or binary.stat().st_size!=artifact['bytes'] or c.host.sha(binary)!=artifact['sha256']:raise ValueError('REVIEWED_PREPARATION_ARTIFACT_REQUIRED')
 return True

def genesis_command(binary,ledger,nodes,reserve,primordial):
 args=[str(binary),'--ledger',str(ledger),'--cluster-type','development','--inflation','none','--hashes-per-tick','auto','--slots-per-epoch','128','--bootstrap-validator-lamports','10000000000','--bootstrap-validator-stake-lamports','100000000000','--fee-burn-percentage','0','--rent-burn-percentage','0','--faucet-pubkey',c.address(reserve),'--faucet-lamports','0','--primordial-accounts-file',str(primordial)]
 for node in nodes:
  args+=['--bootstrap-validator',c.address(node['identity']),c.address(node['vote']),c.address(node['stake'])]
 return args

def replay_commands(binary,ledger):
 base=[str(binary),'--ledger',str(ledger),'--output','json-compact','--unified-scheduler-handler-threads','2']
 return [base+['verify','--halt-at-slot','0','--no-snapshot','--print-bank-hash'],base+['shred-version','--no-snapshot']]

def parse_bank(raw,genesis):
 try:bank=json.loads(raw)
 except (ValueError,TypeError):raise ValueError('EXACT_SLOT_ZERO_BANK_RESULT_REQUIRED')
 if not isinstance(bank,dict) or set(bank)!={'slot','hash'} or type(bank['slot']) is not int or bank['slot']!=0:raise ValueError('EXACT_SLOT_ZERO_BANK_RESULT_REQUIRED')
 value=c.address(bank['hash'])
 if value==genesis:raise ValueError('GENESIS_IS_NOT_A_BANK_HASH')
 return value

def parse_shred(raw):
 if not isinstance(raw,str) or not re.fullmatch('[1-9][0-9]{0,4}\\s*',raw) or int(raw)>65535:raise ValueError('EXACT_SHRED_VERSION_RESULT_REQUIRED')
 return int(raw)

def combine_replays(rows,genesis):
 if len(rows)!=2 or any(set(r)!={'bankHash','shredVersion'} for r in rows):raise ValueError('TWO_FRESH_SLOT_ZERO_REPLAYS_REQUIRED')
 for row in rows:
  c.address(row['bankHash']);parse_shred(str(row['shredVersion']))
  if row['bankHash']==genesis:raise ValueError('GENESIS_IS_NOT_A_BANK_HASH')
 if rows[0]!=rows[1]:raise ValueError('FRESH_SLOT_ZERO_REPLAYS_DISAGREE')
 return rows[0].copy()

def budget_probe(audit):
 if audit.get('clusterType')!='development' or audit.get('genesis') in c.FORBIDDEN:raise ValueError('PRIVATE_DEVELOPMENT_GENESIS_REQUIRED')
 total=audit.get('totalLamports')
 if not isinstance(total,str) or not re.fullmatch('[1-9][0-9]*',total):raise ValueError('EXACT_GENESIS_BUDGET_REQUIRED')
 fixed=int(total)-1
 if not 0<fixed<TOTAL:raise ValueError('SYNTHETIC_BUDGET_EXCEEDED')
 return fixed

def no_active_validator():
 return c.process_admission.no_active_validator()

def run(binary_directory,bundle_id,execute=False):
 if os.environ.get('RAILWAY_SERVICE_ID')==CANONICAL_SERVICE:raise ValueError('CANONICAL_SERVICE_FORBIDDEN')
 preflight=c.host.assess(c.host.probe(binary_directory,BASE.parent))
 if not preflight['canPrepareFreshPrivateRehearsal']:return {'state':'blocked','host':preflight,'createdKeys':False,'createdLedger':False,'validatorsStarted':0,'productionReady':False}
 check_tools(binary_directory)
 if not re.fullmatch('[a-z0-9][a-z0-9-]{7,63}',bundle_id):raise ValueError('NEW_PRIVATE_BUNDLE_ID_REQUIRED')
 if not execute:return {'state':'preparation-host-admitted','host':preflight,'reviewedToolsMatch':True,'createdKeys':False,'createdLedger':False,'validatorsStarted':0,'productionReady':False}
 no_active_validator()
 for directory in [BASE,BASE/'preparations',BASE/'bundles']:
  if directory.is_symlink() or any(p.is_symlink() for p in directory.parents):raise ValueError('PRIVATE_PREPARATION_ROOT_REQUIRED')
  if directory.exists() and (not directory.is_dir() or directory.stat().st_uid!=os.getuid() or stat.S_IMODE(directory.stat().st_mode)&0o077):raise ValueError('OWNER_ONLY_PREPARATION_ROOT_REQUIRED')
 root=BASE/'preparations'/bundle_id;bundle=BASE/'bundles'/bundle_id
 if root.exists() or root.is_symlink() or bundle.exists() or bundle.is_symlink():raise ValueError('RETAINED_PREPARATION_MUST_NOT_BE_REUSED')
 os.umask(0o077)
 for directory in [BASE,BASE/'preparations',BASE/'bundles']:directory.mkdir(mode=0o700,exist_ok=True)
 root.mkdir(mode=0o700);bundle.mkdir(mode=0o700);keys=bundle/'keys';keys.mkdir(mode=0o700)
 proof={'schemaVersion':1,'state':'preparing','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Fresh private synthetic genesis and two slot-zero ledger replays; no running network','validatorsStarted':0,'canonicalNetworkChanged':False,'mainnetActivated':False,'actualFundedBackingVerified':False,'independentOperatorsVerified':False,'productionReady':False,'hostChecksWeakened':False,'createdKeys':False,'createdLedger':False}
 def save():(root/'public-result.json').write_text(json.dumps(proof,indent=2)+'\n')
 save();sequence=0
 def tool(args,timeout=180):
  nonlocal sequence
  # Only the selected offline tools; verify bytes again before every invocation.
  selected={binary_directory/n for n in ['solana-keygen','solana-genesis','classic-genesis-audit-v2','agave-ledger-tool']}
  if Path(args[0]) not in selected:raise ValueError('OFFLINE_PREPARATION_TOOL_REQUIRED')
  check_tools(binary_directory)
  for name,(digest,size) in c.host.PINS.items():
   binary=binary_directory/name
   if binary.is_symlink() or binary.stat().st_size!=size or c.host.sha(binary)!=digest:raise ValueError('REVIEWED_RUNTIME_ARTIFACT_CHANGED')
  sequence+=1
  with (root/('tool-'+str(sequence)+'-private.log')).open('xb') as log:
   return offline_process.run_tool(args,log,timeout=timeout).decode()
 previous_term=signal.getsignal(signal.SIGTERM)
 def stop_requested(signum,frame):raise KeyboardInterrupt()
 signal.signal(signal.SIGTERM,stop_requested)
 try:
  nodes=[]
  for i in range(3):
   node={}
   for kind in ['identity','vote','stake']:
    file=keys/('node-'+str(i)+'-'+kind+'.json')
    tool([str(binary_directory/'solana-keygen'),'new','--no-bip39-passphrase','--silent','--outfile',str(file)])
    if file.is_symlink() or file.stat().st_uid!=os.getuid() or stat.S_IMODE(file.stat().st_mode)&0o077:raise ValueError('OWNER_ONLY_GENERATED_KEY_REQUIRED')
    node[kind]=c.address(tool([str(binary_directory/'solana-keygen'),'pubkey',str(file)]).strip())
   nodes.append(node)
  reserve_key=keys/'synthetic-reserve.json';tool([str(binary_directory/'solana-keygen'),'new','--no-bip39-passphrase','--silent','--outfile',str(reserve_key)])
  if reserve_key.is_symlink() or reserve_key.stat().st_uid!=os.getuid() or stat.S_IMODE(reserve_key.stat().st_mode)&0o077:raise ValueError('OWNER_ONLY_GENERATED_KEY_REQUIRED')
  reserve=c.address(tool([str(binary_directory/'solana-keygen'),'pubkey',str(reserve_key)]).strip())
  if reserve=='11111111111111111111111111111111' or reserve in {v for n in nodes for v in n.values()}:raise ValueError('DISTINCT_SYNTHETIC_RESERVE_REQUIRED')
  primordial=root/'primordial-private.json'
  def genesis(name,reserve_units):
   primordial.write_text(json.dumps({reserve:{'balance':reserve_units,'owner':'11111111111111111111111111111111','data':'~','executable':False}}))
   ledger=root/name
   if ledger.exists():raise ValueError('FRESH_GENESIS_DIRECTORY_REQUIRED')
   proof['createdLedger']=True;save();tool(genesis_command(binary_directory/'solana-genesis',ledger,nodes,reserve,primordial))
   audit=json.loads(tool([str(binary_directory/'classic-genesis-audit-v2'),str(ledger)]));return ledger,audit
  _,probe=genesis('budget-probe',1);fixed=budget_probe(probe);ledger,audit=genesis('fresh-genesis',TOTAL-fixed)
  if audit.get('totalLamports')!=str(TOTAL):raise ValueError('FINAL_GENESIS_SUPPLY_DIFFERS')
  rows=[a for a in audit['accounts'] if a['address']==reserve]
  if len(rows)!=1 or rows[0]['owner']!='11111111111111111111111111111111' or rows[0]['lamports']!=str(TOTAL-fixed):raise ValueError('EXACT_SYNTHETIC_RESERVE_REQUIRED')
  g=bundle/'genesis';g.mkdir(mode=0o700)
  for name in ['genesis.bin','genesis.tar.bz2']:
   source=c.regular(ledger/name)
   with (g/name).open('xb') as target:target.write(source.read_bytes())
  binary_sha=c.host.sha(g/'genesis.bin');archive_sha=c.host.sha(g/'genesis.tar.bz2');replays=[]
  for i in range(2):
   replay=root/('slot-zero-replay-'+str(i));c.genesis_archive.materialize(g/'genesis.tar.bz2',replay,archive_sha,binary_sha)
   commands=replay_commands(binary_directory/'agave-ledger-tool',replay)
   bank=parse_bank(tool(commands[0]),audit['genesis']);shred=parse_shred(tool(commands[1]))
   if c.host.sha(g/'genesis.bin')!=binary_sha or c.host.sha(replay/'genesis.bin')!=binary_sha or c.host.sha(g/'genesis.tar.bz2')!=archive_sha:raise ValueError('GENESIS_CHANGED_DURING_REPLAY')
   replays.append({'bankHash':bank,'shredVersion':shred});proof['completedSlotZeroReplays']=len(replays);save()
  pins=combine_replays(replays,audit['genesis'])
  manifest={'schemaVersion':1,'scope':'fresh-private-consensus-rehearsal','runtimeSource':c.SOURCE,'genesis':audit['genesis'],**pins,'genesisBinSHA256':binary_sha,'genesisArchiveSHA256':archive_sha,'inventorySHA256':c.inventory_hash(audit['accounts']),'totalNativeUnits':str(TOTAL),'validators':nodes}
  c.validate_audit(manifest,audit)
  with (bundle/'manifest.json').open('x') as out:out.write(json.dumps(manifest,indent=2)+'\n')
  selected,summary=c.check_bundle(bundle,binary_directory)
  if selected!=manifest:raise ValueError('FINAL_BUNDLE_DIFFERS')
  proof.update({'state':'prepared','genesis':manifest['genesis'],'bankHash':pins['bankHash'],'shredVersion':pins['shredVersion'],'audit':summary,'sameSlotZeroHashesOnFreshCopies':True,'syntheticReserveNativeUnits':str(TOTAL-fixed),'fixedGenesisNativeUnits':str(fixed),'manifestSHA256':c.host.sha(bundle/'manifest.json')})
 except BaseException as error:
  proof['state']='failed';proof['failureType']=type(error).__name__;message=str(error)
  proof['failureCode']=message if type(error) is ValueError and re.fullmatch('[A-Z_]+',message) else 'PRIVATE_PREPARATION_FAILED'
 finally:
  signal.signal(signal.SIGTERM,previous_term)
  proof['generatedKeyFiles']=sum(p.is_file() and not p.is_symlink() for p in keys.glob('*.json'));proof['createdKeys']=proof['generatedKeyFiles']>0
  proof['createdLedger']=any((root/name).is_dir() for name in ['budget-probe','fresh-genesis','slot-zero-replay-0','slot-zero-replay-1'])
  save()
 return proof

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--binary-directory',type=Path,required=True);p.add_argument('--bundle-id',required=True);p.add_argument('--prepare',action='store_true');p.add_argument('--ack');args=p.parse_args()
 if args.prepare and args.ack!='fresh-private-synthetic-genesis':p.error('Explicit fresh-private-synthetic-genesis acknowledgment required')
 try:result=run(args.binary_directory,args.bundle_id,args.prepare)
 except Exception as error:
  message=str(error);result={'state':'blocked','failureType':type(error).__name__,'failureCode':message if type(error) is ValueError and re.fullmatch('[A-Z_]+',message) else 'PRIVATE_PREPARATION_ADMISSION_FAILED','validatorsStarted':0,'productionReady':False}
 print(json.dumps(result,indent=2));return 0 if result['state'] in ['preparation-host-admitted','prepared'] else 78
if __name__=='__main__':raise SystemExit(main())
