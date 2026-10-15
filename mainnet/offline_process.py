"""Bounded private offline tools with owned process-group cleanup."""
import math,os,selectors,signal,subprocess,time

STDOUT_LIMIT=4*1024**2
STDERR_LIMIT=8*1024**2

def run_tool(args,log,timeout=180,stdout_limit=STDOUT_LIMIT,stderr_limit=STDERR_LIMIT):
 """Return bounded stdout. Retain stderr privately; never print raw failures.

 The caller admits executable pins and private paths. This function cannot
 choose tools, start validators or approve preparation. Every exceptional exit,
 including cancellation, kills and reaps only the process group it started.
 """
 if type(timeout) not in [int,float] or not math.isfinite(timeout) or timeout<=0 or type(stdout_limit) is not int or type(stderr_limit) is not int or min(stdout_limit,stderr_limit)<=0:
  raise ValueError('BOUNDED_OFFLINE_PROCESS_REQUIRED')
 process=None;streams=selectors.DefaultSelector();output=bytearray();stderr_bytes=0
 try:
  process=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
  for name,pipe in [('stdout',process.stdout),('stderr',process.stderr)]:
   os.set_blocking(pipe.fileno(),False);streams.register(pipe,selectors.EVENT_READ,name)
  deadline=time.monotonic()+timeout
  while streams.get_map():
   remaining=deadline-time.monotonic()
   if remaining<=0:raise ValueError('OFFLINE_TOOL_TIMEOUT')
   for entry,_ in streams.select(min(remaining,0.25)):
    chunk=os.read(entry.fileobj.fileno(),65536)
    if not chunk:
     streams.unregister(entry.fileobj);continue
    if entry.data=='stdout':
     if len(output)+len(chunk)>stdout_limit:raise ValueError('OFFLINE_TOOL_STDOUT_LIMIT')
     output.extend(chunk)
    else:
     if stderr_bytes+len(chunk)>stderr_limit:raise ValueError('OFFLINE_TOOL_STDERR_LIMIT')
     log.write(chunk);stderr_bytes+=len(chunk)
  remaining=deadline-time.monotonic()
  if remaining<=0:raise ValueError('OFFLINE_TOOL_TIMEOUT')
  try:code=process.wait(timeout=remaining)
  except subprocess.TimeoutExpired:raise ValueError('OFFLINE_TOOL_TIMEOUT')from None
  if code:raise ValueError('OFFLINE_PREPARATION_TOOL_FAILED')
  return bytes(output)
 except BaseException:
  if process is not None:
   # A child may retain pipes even after its direct parent exits. Signal the
   # owned group even when poll() already reports that parent has stopped.
   try:os.killpg(process.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   process.wait(timeout=10)
  raise
 finally:
  streams.close()
  if process is not None:
   for pipe in [process.stdout,process.stderr]:
    if pipe is not None:pipe.close()
