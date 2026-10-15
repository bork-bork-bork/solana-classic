import importlib.util,unittest,copy
from pathlib import Path
s=importlib.util.spec_from_file_location('host_preflight',Path(__file__).with_name('host-preflight.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class HostPreflight(unittest.TestCase):
 def facts(self):return {'system':'Linux','architecture':'x86_64','fileLimitSoft':1024,'fileLimitHard':1000000,'fileLimitHardUnlimited':False,'effectiveMemoryBytes':m.MIN_MEMORY,'effectiveCpuCount':4,'containerLimitsObserved':True,'availableStorageBytes':m.MIN_FREE,'binaries':{k:{'matchesReviewedArtifact':True,'executable':True} for k in m.PINS}}
 def test_exact_boundaries_admit_only_preparation(self):
  f=self.facts();r=m.assess(f);self.assertTrue(r['canPrepareFreshPrivateRehearsal']);self.assertFalse(r['canStartValidators']);self.assertFalse(r['productionReady']);self.assertFalse(r['changedLimits']);self.assertEqual(f['fileLimitSoft'],1024)
 def test_current_container_fd_ceiling_refuses_before_keys_or_start(self):
  f=self.facts();f['fileLimitHard']=524288;r=m.assess(f);self.assertIn('HARD_OPEN_FILE_LIMIT_BELOW_1000000',r['blockingReasons']);self.assertFalse(r['canPrepareFreshPrivateRehearsal']);self.assertFalse(r['createdKeys']);self.assertFalse(r['createdLedger'])
 def test_unknown_or_low_resources_refuse(self):
  for field,value in [('system','Darwin'),('architecture','arm64'),('containerLimitsObserved',False),('effectiveMemoryBytes',m.MIN_MEMORY-1),('effectiveCpuCount',3.9),('effectiveCpuCount',float('nan')),('availableStorageBytes',None),('availableStorageBytes',m.MIN_FREE-1),('fileLimitHard',True)]:
   f=self.facts();f[field]=value;self.assertFalse(m.assess(f)['canPrepareFreshPrivateRehearsal'])
 def test_missing_or_nonexecutable_or_changed_binary_refuses(self):
  for name in m.PINS:
   for mode in ['missing','changed','executable']:
    f=self.facts()
    if mode=='missing':del f['binaries'][name]
    elif mode=='changed':f['binaries'][name]['matchesReviewedArtifact']=False
    else:f['binaries'][name]['executable']=False
    self.assertFalse(m.assess(f)['canPrepareFreshPrivateRehearsal'])
 def test_unlimited_hard_limit_is_explicit_and_does_not_change_soft_limit(self):
  f=self.facts();f['fileLimitHard']=None;self.assertFalse(m.assess(f)['canPrepareFreshPrivateRehearsal']);f['fileLimitHardUnlimited']=True;self.assertTrue(m.assess(f)['canPrepareFreshPrivateRehearsal']);self.assertEqual(f['fileLimitSoft'],1024)
if __name__=='__main__':unittest.main()
