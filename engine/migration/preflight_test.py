import importlib.util,unittest,json,shutil,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('preflight',Path(__file__).with_name('preflight.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class Gates(unittest.TestCase):
 def fixture(self):
  return {'fetchedAt':'2026-10-14T17:00:00Z','checkpoint':{'candidate':{'api':'fixture'},'engineBuild':{'runId':'40de48b7-6963-429b-ae3e-81a610d81b7d'}},'network':{'state':'online','genesisMatches':True,'identityMatches':True},'engineBuild':{'state':'ready','readyForReview':True,'buildState':'passed','testState':'passed'},'soak':{'state':'passed','accepted':True,'completedJourneys':288,'startedAt':'2026-10-13T16:48:22.762Z','endsAt':'2026-10-14T16:48:22.762Z','issues':[]}}
 def check(self,d):return p.admitted(d,{'candidate':{'api':'fixture'}},p.datetime.datetime(2026,10,14,17,tzinfo=p.datetime.timezone.utc).timestamp())
 def test_actual_completed_matching_run_admitted(self):self.assertTrue(all(self.check(self.fixture()).values()))
 def test_timer_or_partial_journeys_do_not_pass(self):
  for change in [{'accepted':False},{'state':'running'},{'completedJourneys':287},{'startedAt':'2026-10-13T17:00:00Z'},{'endsAt':'2026-10-14T17:48:22.762Z'},{'issues':['failed']}]:
   d=self.fixture();d['soak'].update(change);self.assertFalse(self.check(d)['originalSoakPassed'])
 def test_changed_runtime_or_engine_rejected(self):
  d=self.fixture();d['network']['identityMatches']=False;self.assertFalse(self.check(d)['canonicalRuntimeStillMatches']);d=self.fixture();d['checkpoint']['engineBuild']['runId']='other';self.assertFalse(self.check(d)['sourceBuildReady'])
 def test_stale_or_future_status_rejected(self):
  for stamp in ['2026-10-14T16:58:00Z','2026-10-14T17:00:11Z']:
   d=self.fixture();d['fetchedAt']=stamp;self.assertFalse(self.check(d)['freshStatus'])
 def archive_copy(self,root):
  evidence=root/'evidence';evidence.mkdir()
  for name in ['candidate-freeze.json','stability-original-terminal-review.json']:
   shutil.copyfile(p.ROOT/'evidence'/name,evidence/name)
  shutil.copytree(p.ROOT/'evidence/stability-original-20261014T164823Z',evidence/'stability-original-20261014T164823Z')
 def test_complete_archive_and_tampered_terminal(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);self.archive_copy(root);self.assertTrue(p.terminal_archive_verified(root))
   terminal=root/'evidence/stability-original-20261014T164823Z/soak.json'
   value=json.loads(terminal.read_text());value['completedJourneys']=287;terminal.write_text(json.dumps(value))
   self.assertFalse(p.terminal_archive_verified(root))
 def test_linked_archive_and_missing_proof(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);self.assertFalse(p.terminal_archive_verified(root));self.archive_copy(root)
   proof=root/'evidence/stability-original-terminal-review.json';actual=proof.with_name('actual.json');proof.rename(actual);proof.symlink_to(actual)
   self.assertFalse(p.terminal_archive_verified(root))
if __name__=='__main__':unittest.main()
