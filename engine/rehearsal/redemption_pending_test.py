import importlib.util,unittest,sys
from pathlib import Path
for name,file in [('bootstrap_driver','bootstrap.py'),('cold_copy','cold_copy.py'),('redemption_pending','redemption_pending.py')]:
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(s);sys.modules[name]=m;s.loader.exec_module(m)
r=sys.modules['redemption_pending']
class RedemptionPendingGuards(unittest.TestCase):
    def fixture(self):
        m={'scope':'isolated-synthetic-bootstrap-v2','ports':[20899,21899],'genesi':['private-a','private-b']}
        p={'state':'passed','genesi':m['genesi'],'processes':{'allStopped':True},'operation':{'state':'FINALIZED','id':'J5x5U82o7MdUPvZ7e7FBbBA7ounJ25mC4xAgW2G6QUzn'},'settlementAccepted':True,'originalLedgersUnchanged':True,'originalFixtureUnchanged':True,'bridgeSBF_SHA256':r.driver.ELF_SHA,'sourceBinarySHA256':r.driver.BIN_SHA,'globalBacking':{'actualGenesisBackingVerified':False},'recovery':{'originOutstandingUnits':'1960000','nativeOutstandingUnits':'1960000','originEscrowUnits':'1960000','originUserUnits':'40000','reserveNativeUnits':'42000000','protectedFloorNativeUnits':'2000000'}}
        return m,p,{'state':'passed','stops':[{'returnCode':-2} for _ in range(2)],'crashes':[{'returnCode':-9}]}
    def test_rejects_unsettled_running_public_wrong_program_or_wrong_backing_claim(self):
        r.validate(*self.fixture())
        for mode in ['running','pending','public','program','binary','backing','path']:
            m,p,a=self.fixture()
            if mode=='running':p['processes']['allStopped']=False
            if mode=='pending':p['operation']['state']='PENDING'
            if mode=='public':m['genesi'][0]=next(iter(r.driver.FORBIDDEN))
            if mode=='program':p['bridgeSBF_SHA256']='0'*64
            if mode=='binary':p['sourceBinarySHA256']='0'*64
            if mode=='backing':p['globalBacking']['actualGenesisBackingVerified']=True
            if mode=='path':p['operation']['id']='../../wrong'
            with self.assertRaises(AssertionError):r.validate(m,p,a)
    def test_counter_reserve_or_crash_inventory_mismatch_rejected(self):
        for field in ['originOutstandingUnits','nativeOutstandingUnits','originEscrowUnits','originUserUnits','reserveNativeUnits','protectedFloorNativeUnits']:
            m,p,a=self.fixture();p['recovery'][field]='0'
            with self.assertRaises(AssertionError):r.validate(m,p,a)
        m,p,a=self.fixture();a['crashes'][0]['returnCode']=-2
        with self.assertRaises(AssertionError):r.validate(m,p,a)
    def test_kill_requires_new_origin_copy_and_unfinalized_claim(self):
        raw=b'\0'.join(x.encode() for x in r.command(0))+b'\0';pending={'err':None,'confirmationStatus':'confirmed','slot':99};r.validate_crash(raw,pending,100,68)
        for args in [(raw,None,100,68),(raw,{**pending,'slot':101},100,68),(raw,{**pending,'err':{'InstructionError':[0,'failed']}},100,68),(raw,{**pending,'confirmationStatus':'finalized'},100,68),(raw,pending,100,99),(raw,pending,68,68),(raw.replace(str(r.ROOT).encode(),str(r.SOURCE).encode()),pending,100,68),(b'\0'.join(x.encode() for x in r.command(1))+b'\0',pending,100,68)]:
            with self.assertRaises(AssertionError):r.validate_crash(*args)
    def test_copy_command_never_resets_redeploys_or_mints(self):
        for i in range(2):
            cmd=r.command(i);self.assertEqual(cmd[cmd.index('--ledger')+1],str(r.ROOT/('ledger-'+str(i))))
            for flag in ['--reset','--mint','--bpf-program']:self.assertNotIn(flag,cmd)
if __name__=='__main__':unittest.main()
