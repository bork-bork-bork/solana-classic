import importlib.util,sys,unittest
from pathlib import Path
for name,file in [('bootstrap_driver','bootstrap.py'),('cold_copy','cold_copy.py'),('program_pins','program_pins.py')]:
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
r=sys.modules['program_pins']
class PinWorkerGuards(unittest.TestCase):
    def fixture(self):
        m={'scope':'isolated-synthetic-bootstrap-v2','ports':r.driver.PORTS,'genesi':['private-a','private-b']}
        p={'state':'passed','processes':{'allStopped':True},'operation':{'state':'FINALIZED'},'settlementAccepted':True,'genesi':m['genesi'],'bridgeSBF_SHA256':r.driver.ELF_SHA,'sourceBinarySHA256':r.driver.BIN_SHA,'globalBacking':{'actualGenesisBackingVerified':False},'recovery':{k:'1950000' for k in ['originOutstandingUnits','nativeOutstandingUnits','originEscrowUnits']}}
        return m,p
    def test_running_unknown_public_or_changed_code_cannot_enter(self):
        r.validate(*self.fixture())
        for mode in ['running','pending','public','code','backing','counter','ports']:
            m,p=self.fixture()
            if mode=='running':p['processes']['allStopped']=False
            if mode=='pending':p['operation']['state']='PENDING'
            if mode=='public':m['genesi'][0]=next(iter(r.driver.FORBIDDEN))
            if mode=='code':p['sourceBinarySHA256']='0'*64
            if mode=='backing':p['globalBacking']['actualGenesisBackingVerified']=True
            if mode=='counter':p['recovery']['originEscrowUnits']='0'
            if mode=='ports':m['ports']=[8899,9900]
            with self.assertRaises(AssertionError):r.validate(m,p)
    def test_only_new_copied_ledger_paths_can_start(self):
        for i in range(2):
            c=r.command(i);self.assertEqual(c[c.index('--ledger')+1],str(r.ROOT/('ledger-'+str(i))))
            for flag in ['--reset','--mint','--bpf-program']:self.assertNotIn(flag,c)
        with self.assertRaises(AssertionError):r.command(2)
if __name__=='__main__':unittest.main()
