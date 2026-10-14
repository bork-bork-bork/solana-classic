import importlib.util,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('recovery',Path(__file__).with_name('recovery.py'));r=importlib.util.module_from_spec(s);s.loader.exec_module(r)
class RecoveryBoundary(unittest.TestCase):
 def fixture(self):
  m={'scope':'isolated-synthetic-two-chain','genesi':['fresh-a','fresh-b'],'ports':[20899,21899]};return m,{'state':'passed','genesi':m['genesi']},{'state':'stopped'}
 def test_passed_stopped_private_attempt_required(self):
  m,p,a=self.fixture();r.validate(m,p,a)
  for changed in [{'state':'running'},{'state':'failed'}]:
   with self.assertRaises(AssertionError):r.validate(m,p,changed)
 def test_public_soaking_or_duplicate_genesis_refused(self):
  for forbidden in [*r.FORBIDDEN,'fresh-a']:
   m,p,a=self.fixture();m['genesi'][1]=forbidden
   with self.assertRaises(AssertionError):r.validate(m,p,a)
 def test_prior_proof_and_fixed_ports_must_match(self):
  m,p,a=self.fixture();p['genesi']=['other-a','other-b']
  with self.assertRaises(AssertionError):r.validate(m,p,a)
  m,p,a=self.fixture();m['ports']=[8899,8900]
  with self.assertRaises(AssertionError):r.validate(m,p,a)
 def test_restart_command_keeps_private_ledger_without_reset(self):
  m,_,_=self.fixture()
  for i in [0,1]:
   cmd=r.command(i,m);self.assertNotIn('--reset',cmd);self.assertNotIn('--bpf-program',cmd);self.assertEqual(cmd[cmd.index('--bind-address')+1],'127.0.0.1');self.assertEqual(cmd[cmd.index('--ledger')+1],str(r.SOURCE/('ledger-'+str(i))))
if __name__=='__main__':unittest.main()
