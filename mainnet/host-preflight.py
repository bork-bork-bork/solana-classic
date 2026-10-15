#!/usr/bin/env python3
"""Read-only admission for a private three-validator rehearsal, never mainnet.

No limit changes, subprocesses, key generation, file writes or network calls.
Reports omit hostnames, usernames, supplied paths and raw errors.
"""
import argparse,hashlib,json,os,platform,resource,shutil,sys
from pathlib import Path
PINS={
 'agave-validator':('34e468747f1a0d69399b61fd40edc32ce4690ec5a200b5684474aa60a97a6910',74406832),
 'solana-genesis':('ffbb10cf13737034ae3946e8ac6c106e72ded0886e041d0cbfb7a1fc4780b4c2',21491704),
 'solana-keygen':('2f00a742ab0d99cad929e7a82b2d80f7c519cab9038ec45844fdbe9c305dea65',2804464),
}
MIN_MEMORY=16*1024**3
MIN_FREE=16*1024**3
MIN_CPU=4
REQUIRED_FILES=1_000_000

def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def probe(binary_directory,storage_root):
 soft,hard=resource.getrlimit(resource.RLIMIT_NOFILE)
 memory=os.sysconf('SC_PHYS_PAGES')*os.sysconf('SC_PAGE_SIZE')
 cpu=float(len(os.sched_getaffinity(0))) if hasattr(os,'sched_getaffinity') else float(os.cpu_count() or 0)
 cgroup2=Path('/sys/fs/cgroup/cgroup.controllers').is_file()
 accounting=True
 if cgroup2:
  try:
   cap=Path('/sys/fs/cgroup/memory.max').read_text().strip()
   if cap!='max':memory=min(memory,int(cap))
   quota,period=Path('/sys/fs/cgroup/cpu.max').read_text().split()
   if quota!='max':cpu=min(cpu,int(quota)/int(period))
  except (OSError,ValueError,ZeroDivisionError):accounting=False
 elif Path('/proc/self/cgroup').is_file():
  # Legacy cgroup layouts need explicit support before container acceptance.
  accounting=not bool(Path('/proc/self/cgroup').read_text().strip())
 binaries={}
 for name,(expected,size) in PINS.items():
  p=Path(binary_directory)/name
  try:
   length=p.stat().st_size;digest=sha(p)
   binaries[name]={'sha256':digest,'bytes':length,'executable':os.access(p,os.X_OK),'matchesReviewedArtifact':length==size and digest==expected}
  except OSError:binaries[name]={'matchesReviewedArtifact':False,'readable':False}
 try:
  if not Path(storage_root).is_dir():raise OSError('Storage directory required')
  free=shutil.disk_usage(storage_root).free
 except OSError:free=None
 return {'system':platform.system(),'architecture':platform.machine(),'fileLimitSoft':None if soft==resource.RLIM_INFINITY else soft,'fileLimitHard':None if hard==resource.RLIM_INFINITY else hard,'fileLimitHardUnlimited':hard==resource.RLIM_INFINITY,'effectiveMemoryBytes':memory,'effectiveCpuCount':cpu,'containerLimitsObserved':accounting,'availableStorageBytes':free,'binaries':binaries}

def assess(facts):
 reasons=[]
 if facts.get('system')!='Linux' or facts.get('architecture') not in ['x86_64','amd64']:reasons.append('LINUX_X86_64_REQUIRED')
 hard=facts.get('fileLimitHard')
 if not facts.get('fileLimitHardUnlimited') and (type(hard) is not int or hard<REQUIRED_FILES):reasons.append('HARD_OPEN_FILE_LIMIT_BELOW_1000000')
 if facts.get('containerLimitsObserved') is not True:reasons.append('EFFECTIVE_CONTAINER_LIMITS_UNKNOWN')
 memory=facts.get('effectiveMemoryBytes')
 if type(memory) is not int or memory<MIN_MEMORY:reasons.append('REHEARSAL_MEMORY_BELOW_16_GIB')
 cpu=facts.get('effectiveCpuCount')
 if type(cpu) not in [int,float] or not MIN_CPU<=cpu<1_000_000:reasons.append('REHEARSAL_CPU_BELOW_4')
 free=facts.get('availableStorageBytes')
 if type(free) is not int or free<MIN_FREE:reasons.append('REHEARSAL_FREE_STORAGE_BELOW_16_GIB')
 for name in PINS:
  item=facts.get('binaries',{}).get(name,{})
  if item.get('matchesReviewedArtifact') is not True or item.get('executable') is not True:reasons.append('REVIEWED_BINARY_MISSING_OR_CHANGED:'+name)
 return {'schemaVersion':1,'scope':'Read-only host admission for private three-validator rehearsal; not production sizing or startup/consensus proof','state':'blocked' if reasons else 'host-preflight-passed','blockingReasons':reasons,'requirements':{'hardOpenFiles':REQUIRED_FILES,'memoryBytes':MIN_MEMORY,'availableStorageBytes':MIN_FREE,'effectiveCpuCount':MIN_CPU},'facts':facts,'canPrepareFreshPrivateRehearsal':not reasons,'canStartValidators':False,'productionReady':False,'mainnetActivationAuthorized':False,'changedLimits':False,'createdKeys':False,'createdLedger':False,'networkRequests':0}

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--binary-directory',required=True);p.add_argument('--storage-root',required=True);a=p.parse_args()
 try:result=assess(probe(a.binary_directory,a.storage_root))
 except (OSError,ValueError,OverflowError):
  result={'schemaVersion':1,'state':'blocked','blockingReasons':['HOST_PROBE_INCOMPLETE'],'canPrepareFreshPrivateRehearsal':False,'canStartValidators':False,'productionReady':False,'mainnetActivationAuthorized':False}
 print(json.dumps(result,indent=2));return 0 if result['canPrepareFreshPrivateRehearsal'] else 78
if __name__=='__main__':sys.exit(main())
