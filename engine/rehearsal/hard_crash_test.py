import importlib.util,unittest,sys
from pathlib import Path
for name,file in [('bootstrap_driver','bootstrap.py'),('cold_copy','cold_copy.py'),('hard_crash','hard_crash.py')]:
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
r=sys.modules['hard_crash']
class HardCrashBoundary(unittest.TestCase):
    def fixture(self):
        m={'scope':'isolated-synthetic-bootstrap-v2','ports':[20899,21899],'genesi':['fresh-a','fresh-b']}
        p={'state':'passed','genesi':m['genesi'],'processes':{'allStopped':True},'coldArchive':{'extractionVerified':True},'originalLedgersUnchanged':True,'bridgeSBF_SHA256':r.driver.ELF_SHA,'globalBacking':{'actualGenesisBackingVerified':False}}
        return m,p,{'state':'passed','stops':[{'returnCode':-2} for _ in range(4)]}
    def test_only_passed_stopped_private_restore_admitted(self):
        m,p,a=self.fixture();r.validate(m,p,a)
        for field in ['state','stops']:
            m,p,a=self.fixture();a[field]='running' if field=='state' else []
            with self.assertRaises(AssertionError):r.validate(m,p,a)
    def test_public_duplicate_wrong_program_and_backing_claim_refused(self):
        for mode in ['public','duplicate','program','backing']:
            m,p,a=self.fixture()
            if mode=='public':m['genesi'][0]=next(iter(r.driver.FORBIDDEN))
            if mode=='duplicate':m['genesi'][1]=m['genesi'][0]
            if mode=='program':p['bridgeSBF_SHA256']='0'*64
            if mode=='backing':p['globalBacking']['actualGenesisBackingVerified']=True
            with self.assertRaises(AssertionError):r.validate(m,p,a)
    def test_commands_open_only_new_copies_without_reset_or_deployment(self):
        for i in range(2):
            cmd=r.command(i);self.assertEqual(cmd[cmd.index('--ledger')+1],str(r.ROOT/('ledger-'+str(i))));self.assertNotIn('--reset',cmd);self.assertNotIn('--bpf-program',cmd);self.assertNotIn('--mint',cmd)
    def test_kill_guard_rejects_worker_wrong_binary_or_any_original_ledger(self):
        for i in range(2):
            valid=b'\0'.join(x.encode() for x in r.command(i))+b'\0';r.validate_kill_command(valid,i)
            for wrong in [b'python3\0worker.py\0',valid.replace(str(r.ROOT).encode(),str(r.SOURCE).encode()),valid.replace(str(r.driver.BIN).encode(),b'/other/validator')]:
                with self.assertRaises(AssertionError):r.validate_kill_command(wrong,i)
if __name__=='__main__':unittest.main()
