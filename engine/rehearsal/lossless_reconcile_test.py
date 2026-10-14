import importlib.util,unittest,sys,copy
from pathlib import Path
for name in ['recovery','cold_copy','lossless_reconcile']:
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'));m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
r=sys.modules['lossless_reconcile']
class LosslessReconcileBoundary(unittest.TestCase):
    def fixture(self):
        m={'scope':'isolated-synthetic-two-chain','ports':[20899,21899],'genesi':['private-origin','private-native']}
        records=[{'id':'receipt-'+str(i),'state':'FINALIZED','attempts':1,'scope':['isolated-native-claim','isolated-origin-redemption'][i],'expectedGenesis':m['genesi'][1-i],'rpc':'http://127.0.0.1:'+str(m['ports'][1-i])+'/','sourceRpc':'http://127.0.0.1:'+str(m['ports'][i])+'/'} for i in range(2)]
        p=[{'state':'passed','processRecovery':{'allStopped':True},'genesi':m['genesi'],'operation':{'id':v['id']}} for v in records]
        return m,p,[{'state':'passed'} for _ in range(2)],records
    def test_admits_only_finalized_used_journals_and_stopped_passed_attempts(self):
        original=self.fixture();r.validate(*original)
        for target,field,value in [(1,'state','running'),(2,'state','failed'),(3,'state','PENDING'),(3,'attempts',0)]:
            args=copy.deepcopy(original);args[target][0][field]=value
            with self.assertRaises(AssertionError):r.validate(*args)
        args=copy.deepcopy(original);args[1][0]['processRecovery']['allStopped']=False
        with self.assertRaises(AssertionError):r.validate(*args)
    def test_public_wrong_domain_endpoint_direction_and_receipt_refused(self):
        for field,value in [('rpc','https://example.com/'),('sourceRpc','http://127.0.0.1:9999/'),('expectedGenesis','wrong'),('scope','isolated-origin-redemption'),('id','another')]:
            args=self.fixture();args[3][0][field]=value
            with self.assertRaises(AssertionError):r.validate(*args)
        args=self.fixture();args[0]['genesi'][0]=next(iter(r.driver.FORBIDDEN))
        with self.assertRaises(AssertionError):r.validate(*args)
    def test_commands_only_open_new_copies(self):
        for i in range(2):
            cmd=r.command(i);self.assertEqual(cmd[cmd.index('--ledger')+1],str(r.ROOT/('ledger-'+str(i))))
            for flag in ['--reset','--mint','--bpf-program']:self.assertNotIn(flag,cmd)
if __name__=='__main__':unittest.main()
