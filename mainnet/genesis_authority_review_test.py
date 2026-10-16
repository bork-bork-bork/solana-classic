import copy,hashlib,os,tempfile,unittest
from pathlib import Path
from genesis_authority_review import compare,selected_file,review
class AuthorityReviewTests(unittest.TestCase):
 def fixture(self):
  rows=[{'address':'stake','owner':'Stake11111111111111111111111111111111111111','lamports':'11','dataBytes':200,'executable':False,'dataSHA256':'a'*64},{'address':'vote','owner':'Vote111111111111111111111111111111111111111','lamports':'13','dataBytes':3762,'executable':False,'dataSHA256':'b'*64}]
  d={'genesis':'synthetic','accountCount':2,'totalNativeUnits':'24','accounts':rows,'genesisAccountBytesDecoded':True,'authorityKeysDecoded':True,'stakeAccounts':[{'address':'stake','nativeUnits':'11','dataSHA256':'a'*64,'authorities':{'staker':'node','withdrawer':'node','lockup':{'unixTimestamp':'0','epoch':'0','custodian':'11111111111111111111111111111111'},'delegation':{'voter':'vote'}}}],'voteAccounts':[{'address':'vote','nativeUnits':'13','dataSHA256':'b'*64,'authorities':{'node':'node','withdrawer':'node','authorizedVoters':[{'epoch':'0','voter':'node'}]}}]}
  for k in ['keyCustodyVerified','lockupEnforcementVerified','reserveCustodyVerified','backingVerified','independentOperatorsVerified','consensusVerified','canSign','canBroadcast','mainnetActivated','productionReady']:d[k]=False
  e={'genesisAudit':{'genesis':'synthetic','accountCount':2,'totalLamports':'24','accounts':[{k:v for k,v in row.items() if k!='dataSHA256'} for row in rows]}}
  return d,e
 def test_complete_matching_rows_expose_shared_roles_without_custody_permission(self):
  d,e=self.fixture();before=copy.deepcopy(d);r=compare(d,e)
  self.assertEqual(r['distinctWithdrawalKeysAcrossStakeAndVote'],1);self.assertEqual(r['stakeWithdrawerEqualsDelegatedVoteNodeCount'],1);self.assertEqual(r['voteVoterEqualsNodeRecords'],1);self.assertEqual(r['stakeNondefaultLockupFieldsCount'],0);self.assertFalse(r['actualCustodyVerified']);self.assertFalse(r['productionReady']);self.assertEqual(d,before)
 def test_inventory_coverage_and_authority_byte_mismatches_refuse(self):
  for mutate in [lambda d:d.update(accountCount=3),lambda d:d['accounts'][0].update(lamports='12'),lambda d:d.update(stakeAccounts=[]),lambda d:d['stakeAccounts'].append(copy.deepcopy(d['stakeAccounts'][0])),lambda d:d['stakeAccounts'][0].update(dataSHA256='c'*64),lambda d:d['voteAccounts'][0].update(nativeUnits='14')]:
   d,e=self.fixture();mutate(d)
   with self.assertRaises(ValueError):compare(d,e)
 def test_permission_promotions_and_missing_decode_proofs_refuse(self):
  for field in ['canSign','canBroadcast','productionReady','keyCustodyVerified','reserveCustodyVerified','independentOperatorsVerified','consensusVerified']:
   d,e=self.fixture();d[field]=True
   with self.assertRaises(ValueError):compare(d,e)
  d,e=self.fixture();d['authorityKeysDecoded']=False
  with self.assertRaises(ValueError):compare(d,e)
 def test_nondefault_lockup_fields_are_observations_not_enforcement(self):
  d,e=self.fixture();d['stakeAccounts'][0]['authorities']['lockup']['epoch']='18446744073709551615';r=compare(d,e);self.assertEqual(r['stakeNondefaultLockupFieldsCount'],1);self.assertFalse(r['lockupEnforcementVerified'])
 def test_selected_files_reject_links_wrong_hash_sizes_and_writable_inputs(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t).resolve()/'genesis';p.write_bytes(b'selected');p.chmod(0o600);digest=hashlib.sha256(b'selected').hexdigest();self.assertEqual(selected_file(p,digest,10),b'selected')
   q=Path(t).resolve()/'link';q.symlink_to(p)
   for args in [(q,digest,10),(p,'0'*64,10),(p,digest,3)]:
    with self.assertRaises((ValueError,OSError)):selected_file(*args)
   p.chmod(0o622)
   with self.assertRaises(ValueError):selected_file(p,digest,10)
 def test_wrong_worker_refuses_before_namespace_or_process_access(self):
  class Args:pass
  from unittest.mock import patch
  with patch.dict(os.environ,{'RAILWAY_SERVICE_ID':'wrong'}):
   with self.assertRaisesRegex(ValueError,'EXACT_PRIVATE_WORKER_REQUIRED'):review(Args())
if __name__=='__main__':unittest.main()
