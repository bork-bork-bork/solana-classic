import importlib.util,unittest,sys
from pathlib import Path
for name,file in [('bootstrap_driver','bootstrap.py'),('cold_copy','cold_copy.py'),('cold_restore','cold_restore.py')]:
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
r=sys.modules['cold_restore']
class ColdRestoreBoundary(unittest.TestCase):
    def fixture(self):
        m={'scope':'isolated-synthetic-bootstrap-v2','ports':[20899,21899],'genesi':['fresh-a','fresh-b']}
        p={'state':'passed','processes':{'allStopped':True},'genesi':m['genesi'],'bridgeSBF_SHA256':r.driver.ELF_SHA,'reconciliation':{'nativeOutstandingOriginUnits':'1950000'},'globalBacking':{'completeInventoryVerified':False,'actualGenesisBackingVerified':False}}
        return m,p,{'state':'passed','stops':[{'returnCode':-2},{'returnCode':-2}]}
    def test_only_complete_stopped_v2_fixture_with_false_backing_gate_admitted(self):
        m,p,a=self.fixture();r.validate(m,p,a)
        for mutate in [lambda:p.update(state='running'),lambda:a.update(stops=[]),lambda:p['globalBacking'].update(actualGenesisBackingVerified=True)]:
            m,p,a=self.fixture();mutate()
            with self.assertRaises(AssertionError):r.validate(m,p,a)
    def test_public_duplicate_wrong_binary_or_wrong_balance_rejected(self):
        for change in ['public','duplicate','binary','counter']:
            m,p,a=self.fixture()
            if change=='public':m['genesi'][0]=next(iter(r.driver.FORBIDDEN))
            if change=='duplicate':m['genesi'][1]=m['genesi'][0]
            if change=='binary':p['bridgeSBF_SHA256']='0'*64
            if change=='counter':p['reconciliation']['nativeOutstandingOriginUnits']='0'
            with self.assertRaises(AssertionError):r.validate(m,p,a)
    def test_only_new_copied_ledgers_run_without_reset_or_redeployment(self):
        for i in range(2):
            for group in ['working','restored']:
                cmd=r.command(i,r.ROOT/group/('ledger-'+str(i)));self.assertNotIn('--reset',cmd);self.assertNotIn('--bpf-program',cmd);self.assertNotIn('--mint',cmd)
            with self.assertRaises(AssertionError):r.command(i,r.SOURCE/('ledger-'+str(i)))
if __name__=='__main__':unittest.main()
