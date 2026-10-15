import importlib.util, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('http_start',Path(__file__).with_name('http_start.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class Startup(unittest.TestCase):
    def packet(self):
        return {'schemaVersion':1,'scope':'isolated-source-http-recovery-target','approved':True,'providerAssignmentVerified':True,'attempt':'11111111-1111-4111-8111-111111111111','freezeSha256':h.core.FREEZE_SHA,'archiveSha256':h.core.ARCHIVE_SHA,'rawArchiveSha256':h.core.RAW_SHA,'target':{'projectId':h.core.PROJECT,'environmentId':h.core.ENVIRONMENT,'serviceId':h.SERVICE,'volumeId':h.VOLUME,'api':'https://recovery-drill-production.up.railway.app'}}
    def environment(self):return {'RAILWAY_PROJECT_ID':h.core.PROJECT,'RAILWAY_ENVIRONMENT_ID':h.core.ENVIRONMENT,'RAILWAY_SERVICE_ID':h.SERVICE,'RAILWAY_VOLUME_MOUNT_PATH':'/data'}
    def test_existing_isolated_target_only(self):
        r=self.packet();h.admit(r,self.environment(),r['attempt'])
        for key,value in [('RAILWAY_SERVICE_ID',h.core.CANONICAL),('RAILWAY_SERVICE_ID',h.core.WORKER),('SC_OPERATION','cold-restore'),('SC_MIGRATION_MODE','canonical-testnet')]:
            e=self.environment();e[key]=value
            with self.assertRaises(ValueError):h.admit(r,e,r['attempt'])
    def test_archive_volume_and_attempt_cannot_be_relabelled(self):
        for field,value in [('archiveSha256','0'*64),('providerAssignmentVerified',False),('attempt','different')]:
            r=self.packet();r[field]=value
            with self.assertRaises(ValueError):h.admit(r,self.environment(),'11111111-1111-4111-8111-111111111111')
        r=self.packet();r['target']['volumeId']=h.core.VOLUME
        with self.assertRaises(ValueError):h.admit(r,self.environment(),r['attempt'])
if __name__=='__main__':unittest.main()
