import importlib.util,unittest,sys
from pathlib import Path
for name,file in [('bootstrap_driver','bootstrap.py'),('cold_copy','cold_copy.py'),('pending_crash','pending_crash.py')]:
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
r=sys.modules['pending_crash']
class PendingCrashGuards(unittest.TestCase):
    def fixture(self):
        m={'scope':'isolated-synthetic-bootstrap-v2','ports':[20899,21899],'genesi':['private-a','private-b']}
        p={'state':'passed','genesi':m['genesi'],'processes':{'allStopped':True},'coldArchive':{'extractionVerified':True},'originalLedgersUnchanged':True,'bridgeSBF_SHA256':r.driver.ELF_SHA,'globalBacking':{'actualGenesisBackingVerified':False}}
        return m,p,{'state':'passed','stops':[{'returnCode':-2} for _ in range(4)]}
    def test_unpassed_running_public_wrong_program_or_backing_claim_rejected(self):
        r.validate(*self.fixture())
        for mode in ['running','public','program','backing']:
            m,p,a=self.fixture()
            if mode=='running':p['processes']['allStopped']=False
            if mode=='public':m['genesi'][0]=next(iter(r.driver.FORBIDDEN))
            if mode=='program':p['bridgeSBF_SHA256']='0'*64
            if mode=='backing':p['globalBacking']['actualGenesisBackingVerified']=True
            with self.assertRaises(AssertionError):r.validate(m,p,a)
    def test_crash_guard_refuses_finalized_claim_wrong_ledger_or_inactive_slot(self):
        raw=b'\0'.join(x.encode() for x in r.command(1))+b'\0';pending={'err':None,'confirmationStatus':'processed','slot':99}
        r.validate_crash(raw,pending,100,68);r.validate_crash(raw,None,100,68)
        for args in [(raw,{**pending,'confirmationStatus':'finalized'},100,68),(raw,pending,100,99),(raw,pending,68,68),(raw.replace(str(r.ROOT).encode(),str(r.SOURCE).encode()),pending,100,68)]:
            with self.assertRaises(AssertionError):r.validate_crash(*args)
    def test_only_new_copy_without_reset_program_deploy_or_mint(self):
        for i in range(2):
            cmd=r.command(i);self.assertEqual(cmd[cmd.index('--ledger')+1],str(r.ROOT/('ledger-'+str(i))))
            for flag in ['--reset','--mint','--bpf-program']:self.assertNotIn(flag,cmd)
if __name__=='__main__':unittest.main()
