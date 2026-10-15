import importlib.util,json,tempfile,unittest,hashlib
from pathlib import Path
from unittest.mock import patch,Mock
s=importlib.util.spec_from_file_location('consensus',Path(__file__).with_name('consensus.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def key(n):
 raw=n.to_bytes(32,'big');value=n;out=''
 while value:out=m.ALPHABET[value%58]+out;value//=58
 return '1'*(len(raw)-len(raw.lstrip(b'\0')))+out

def fixture():
 nodes=[{'identity':key(100+i*3),'vote':key(101+i*3),'stake':key(102+i*3)} for i in range(3)]
 accounts=[]
 for n in nodes:
  for name,owner in [('identity','11111111111111111111111111111111'),('vote','Vote111111111111111111111111111111111111111'),('stake','Stake11111111111111111111111111111111111111')]:accounts.append({'address':n[name],'owner':owner,'lamports':'100','dataBytes':0,'executable':False})
 manifest={'schemaVersion':1,'scope':'fresh-private-consensus-rehearsal','runtimeSource':m.SOURCE,'genesis':key(500),'bankHash':key(501),'shredVersion':123,'genesisBinSHA256':'1'*64,'genesisArchiveSHA256':'2'*64,'inventorySHA256':m.inventory_hash(accounts),'totalNativeUnits':'900','validators':nodes}
 audit={'genesis':manifest['genesis'],'clusterType':'development','totalLamports':'900','accounts':accounts,'accountCount':9,'inflation':{'initial':0,'terminal':0},'feeRateGovernor':{'burnPercent':0},'rent':{'burn_percent':0},'pohConfig':{'hashes_per_tick':12500}}
 return manifest,audit
class ConsensusPacket(unittest.TestCase):
 def test_private_schema_and_exact_audited_native_inventory(self):
  manifest,audit=fixture();r=m.validate_audit(manifest,audit);self.assertEqual(r['totalNativeUnits'],'900');self.assertEqual(r['accountCount'],9);self.assertFalse(r['actualFundedOriginalBackingVerified'])
 def test_public_canonical_bad_bank_or_nonisolated_manifest_refuses(self):
  for field,value in [('genesis','7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'),('genesis','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'),('scope','mainnet'),('runtimeSource','0'*40),('bankHash','bad'),('schemaVersion',True),('shredVersion',0),('shredVersion',True),('totalNativeUnits','0900'),('totalNativeUnits',900),('totalNativeUnits','18446744073709551616')]:
   f,_=fixture();f[field]=value
   with self.assertRaises(ValueError):m.validate_manifest(f)
 def test_duplicate_zero_or_extra_identity_keys_refuse(self):
  for mode in ['duplicate','zero','extra','count']:
   f,_=fixture()
   if mode=='duplicate':f['validators'][1]['identity']=f['validators'][0]['identity']
   if mode=='zero':f['validators'][0]['vote']='11111111111111111111111111111111'
   if mode=='extra':f['validators'][0]['keyFile']='private.json'
   if mode=='count':f['validators'].pop()
   with self.assertRaises(ValueError):m.validate_manifest(f)
 def test_missing_hashing_duplicate_accounts_wrong_owner_or_supply_cannot_pass(self):
  for mode in ['sleep','zeroHashing','duplicate','owner','supply','inflation','burn','inventory','genesis']:
   f,a=fixture()
   if mode=='sleep':a['pohConfig']['hashes_per_tick']=None
   if mode=='zeroHashing':a['pohConfig']['hashes_per_tick']=0
   if mode=='duplicate':a['accounts'][1]=a['accounts'][0].copy();f['inventorySHA256']=m.inventory_hash(a['accounts'])
   if mode=='owner':a['accounts'][0]['owner']=key(999);f['inventorySHA256']=m.inventory_hash(a['accounts'])
   if mode=='supply':a['totalLamports']='899'
   if mode=='inflation':a['inflation']['initial']=0.01
   if mode=='burn':a['feeRateGovernor']['burnPercent']=50
   if mode=='inventory':f['inventorySHA256']='0'*64
   if mode=='genesis':a['genesis']=key(600)
   with self.assertRaises(ValueError):m.validate_audit(f,a)
 def test_commands_keep_host_and_poh_checks_and_require_supermajority_expected_bank_and_shred(self):
  f,_=fixture();forbidden=['--no-port-check','--no-poh-speed-test','--no-os-network-limits-test','--no-wait-for-vote-to-start-leader','--reset','--faucet-port']
  for i in range(3):
   c=m.command(Path('/runtime/agave-validator'),Path('/private/run'),Path('/private/bundle'),f,i)
   for flag in forbidden:self.assertNotIn(flag,c)
   for flag,value in [('--expected-genesis-hash',f['genesis']),('--expected-bank-hash',f['bankHash']),('--expected-shred-version','123'),('--wait-for-supermajority','0'),('--bind-address','127.0.0.1'),('--rpc-bind-address','127.0.0.1')]:self.assertEqual(c[c.index(flag)+1],value)
   self.assertIn('--private-rpc',c);self.assertIn('--no-genesis-fetch',c);self.assertIn('--no-snapshot-fetch',c)
   self.assertEqual(c.count('--known-validator'),3)
   if i:self.assertEqual(c[c.index('--entrypoint')+1],'127.0.0.1:'+str(m.ports(0)['gossip']))
 def test_rpc_websocket_gossip_and_every_dynamic_port_are_disjoint(self):
  p=m.all_ports();self.assertEqual(len(p),len(set(p)))
  for i in [-1,3,True]:
   with self.assertRaises(ValueError):m.ports(i)
 def test_blocked_host_never_reads_keys_creates_ledger_or_starts_process(self):
  with patch.object(m.host,'probe',return_value={}),patch.object(m.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':False}),patch.object(m,'check_bundle') as check,patch.object(m.subprocess,'Popen') as popen:
   r=m.run(Path('/not-read'),Path('/not-read'),'new-private-001',True);self.assertEqual(r['state'],'blocked');self.assertFalse(r['createdLedger']);check.assert_not_called();popen.assert_not_called()
 def test_retained_run_directory_refuses_without_bundle_read_or_start(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp).resolve();(base/'runs'/'retained-001').mkdir(parents=True)
   with patch.object(m,'BASE',base),patch.object(m.host,'probe',return_value={}),patch.object(m.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(m,'check_bundle') as check:
    with self.assertRaisesRegex(ValueError,'RETAINED'):m.run(base,base,'retained-001',True)
    check.assert_not_called()
 def test_shared_finalized_observation_requires_each_identity_rooted_votes_exact_supply_and_same_block(self):
  f,_=fixture()
  def rpc(port,method,params=None):
   i=next(i for i in range(3) if m.ports(i)['rpc']==port)
   return {'getGenesisHash':f['genesis'],'getIdentity':{'identity':f['validators'][i]['identity']},'getVersion':{'solana-core':'3.0.14'},'getSlot':50+i,'getSupply':{'value':{'total':900}},'getInflationGovernor':{'initial':0,'terminal':0},'getVoteAccounts':{'current':[{'votePubkey':n['vote'],'nodePubkey':n['identity'],'lastVote':49,'rootSlot':40,'activatedStake':100} for n in f['validators']]},'getBlock':{'blockhash':key(700)}}[method]
  with patch.object(m,'rpc',side_effect=rpc):r=m.runtime_observation(f);self.assertEqual(r['sharedFinalizedSlot'],50)
  for mode in ['identity','supply','votes','block','version']:
   def bad(port,method,params=None):
    r=rpc(port,method,params)
    if mode=='identity' and method=='getIdentity':return {'identity':key(999)}
    if mode=='supply' and method=='getSupply':return {'value':{'total':901}}
    if mode=='votes' and method=='getVoteAccounts':r['current'][0]['lastVote']=0
    if mode=='block' and method=='getBlock' and port==m.ports(1)['rpc']:return {'blockhash':key(701)}
    if mode=='version' and method=='getVersion':return {'solana-core':'other'}
    return r
   with patch.object(m,'rpc',side_effect=bad):
    with self.assertRaises(ValueError):m.runtime_observation(f)
 def test_non_loopback_port_cannot_be_selected_by_rpc_caller(self):
  with patch.object(m.urllib.request,'urlopen') as network:
   with self.assertRaises(ValueError):m.rpc(8899,'getGenesisHash')
   network.assert_not_called()

 def test_partial_start_failure_stops_only_owned_process_and_retains_failed_attempt(self):
  f,_=fixture()
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp).resolve();bundle=base/'bundles'/'fixture';(bundle/'genesis').mkdir(parents=True);binaries=base/'binaries';binaries.mkdir();(binaries/'agave-validator').write_bytes(b'x')
   (bundle/'genesis'/'genesis.bin').write_bytes(b'g')
   import bz2,io,tarfile
   buffer=io.BytesIO()
   with tarfile.open(fileobj=buffer,mode='w:') as archive:
    for name,data in [('genesis.bin',b'g'),('rocksdb/CURRENT',b'MANIFEST-000001')]:
     item=tarfile.TarInfo(name);item.size=len(data);archive.addfile(item,io.BytesIO(data))
   archive_bytes=bz2.compress(buffer.getvalue());(bundle/'genesis'/'genesis.tar.bz2').write_bytes(archive_bytes)
   digest=hashlib.sha256(b'g').hexdigest();f['genesisBinSHA256']=digest;f['genesisArchiveSHA256']=hashlib.sha256(archive_bytes).hexdigest()
   child=Mock(pid=123456,returncode=None);child.poll.side_effect=lambda:child.returncode
   def wait(timeout):child.returncode=-2;return -2
   child.wait.side_effect=wait
   def hash_file(p):return 'a'*64 if p.name=='agave-validator' else digest
   with patch.object(m,'BASE',base),patch.object(m.host,'probe',return_value={}),patch.object(m.host,'assess',return_value={'canPrepareFreshPrivateRehearsal':True}),patch.object(m.host,'PINS',{'agave-validator':('a'*64,1)}),patch.object(m.host,'sha',side_effect=hash_file),patch.object(m,'check_bundle',return_value=(f,{})),patch.object(m.subprocess,'Popen',side_effect=[child,OSError('PRIVATE PATH MUST STAY REDACTED')]) as popen,patch.object(m.socket,'socket'),patch.object(m.os,'killpg') as kill:
    r=m.run(bundle,binaries,'partial-failure-001',True)
   self.assertEqual(r['state'],'failed');self.assertEqual(r['validatorsStarted'],1);self.assertTrue(r['allStopped']);self.assertEqual(len(r['stops']),1);self.assertNotIn('PRIVATE PATH',json.dumps(r));self.assertEqual(popen.call_count,2);kill.assert_called_once_with(123456,m.signal.SIGINT);self.assertTrue((base/'runs'/'partial-failure-001'/'public-result.json').is_file())
 def test_mutating_rpc_methods_cannot_be_selected(self):
  with patch.object(m.urllib.request,'urlopen') as network:
   with self.assertRaisesRegex(ValueError,'READ_ONLY'):m.rpc(m.ports(0)['rpc'],'sendTransaction')
   network.assert_not_called()

 def test_process_exit_race_does_not_prevent_wait_or_cleanup(self):
  child=Mock(pid=123456,returncode=None);child.poll.return_value=None
  def wait(timeout):child.returncode=-2;return -2
  child.wait.side_effect=wait
  with patch.object(m.os,'killpg',side_effect=ProcessLookupError):r=m.stop_owned_process(child)
  self.assertEqual(r,{'returnCode':-2,'forced':False});child.wait.assert_called_once_with(timeout=45)
 def test_forced_private_stop_is_reported_and_bounded(self):
  child=Mock(pid=123456,returncode=None);child.poll.return_value=None
  def wait(timeout):
   if timeout==45:raise m.subprocess.TimeoutExpired('private',45)
   child.returncode=-9;return -9
  child.wait.side_effect=wait
  with patch.object(m.os,'killpg') as kill:r=m.stop_owned_process(child)
  self.assertTrue(r['forced']);self.assertEqual(r['returnCode'],-9);self.assertEqual(kill.call_count,2);self.assertEqual(child.wait.call_args.kwargs['timeout'],10)
if __name__=='__main__':unittest.main()
