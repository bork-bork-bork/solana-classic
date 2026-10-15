#!/usr/bin/env python3
"""First-party commit/push privacy checks. Hooks can be bypassed; review still matters."""
import hashlib,json,os,re,subprocess,sys
TEAM='Solana Classic Labs'
ANCHOR='7c4d0c89e63e52c61cc9af6bc10f32765f4570e3'
DENIED=set(['49f9ff608bcf6755bda53f53353acde2a86e33414b9d6b889bfb35e75f2e7272', '2d49908cf2b1d0ace81d4a843013f71defa2f1caaa8493f436fd95d0f4c3b812', '0917d1c7194bba1a99e39f945f234712e1709a71d90a1bee35298ecfdd3dfae0', 'fa0ead27b3c29122746873b741ab94b2792e11433ca2bd12e3b021d34f47ad98', '2ec716e4dc4329cdd25b5714267892d55d4c035f82418b32226be31278cbef79', 'e1797dc1e30ad7954859380cb8cc30e58572efb8739c604c01b46535eba4abdd', 'cf50252908e527ebc5cacf537c3a4495a0c0ce5e1f0ec383b18290642cc8afaa'])
def git(*args):
 return subprocess.check_output(['git',*args],stderr=subprocess.DEVNULL)
def scan(data):
 if b'\0' in data:return
 text=data.decode('utf-8','replace')
 if re.search(r'/(?:Users|home)/[^\s/]+/',text):raise ValueError('Personal home-directory path')
 if re.search(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',text):raise ValueError('Email address')
 if re.search(r'(?i)'+ 'Mac'+'Book'+r'[^\s]*\.'+'local'+r'|BEGIN (?:[A-Z ]+)?PRIVATE KEY',text):raise ValueError('Machine identity or private key')
 for token in re.findall(r'[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*',text):
  if hashlib.sha256(token.casefold().encode()).hexdigest() in DENIED:raise ValueError('Protected personal identifier')
 if re.search(r'(?i)secretKey\s*[:=]\s*\[[0-9,\s]{100,}\]',text):raise ValueError('Literal private-key array')
 try:v=json.loads(text)
 except (ValueError,TypeError):return
 if isinstance(v,list) and len(v)==64 and all(type(x)is int and 0<=x<=255 for x in v):raise ValueError('Raw keypair JSON')
def identity():
 for kind in ['AUTHOR','COMMITTER']:
  ident=git('var','GIT_'+kind+'_IDENT').decode()
  if not ident.startswith(TEAM+' <> '):raise ValueError('Use the team identity with an empty email address')
def changes():
 for path in git('diff','--cached','--name-only','--diff-filter=ACMR','-z').split(b'\0'):
  if not path:continue
  name=path.decode()
  if name.startswith(('.data/','.tools/')) or re.search(r'(?:keypair|id_rsa|id_ed25519)(?:\.json)?$',name):raise ValueError('Private runtime/key file staged')
  if name.startswith('engine/agave/'):continue # Preserve upstream author/license text.
  data=git('show',':'+name)
  if len(data)>16_777_216:raise ValueError('Large staged file requires separate review')
  scan(data)
def push(lines):
 for line in lines:
  local,sha,remote,prior=line.split()
  if local=='refs/heads/build/six-day-mvp':raise ValueError('Retired pre-rewrite branch cannot be pushed')
  if sha=='0'*40:raise ValueError('Remote deletion requires separate review')
  if subprocess.run(['git','merge-base','--is-ancestor',ANCHOR,sha],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:raise ValueError('Push must descend from the cleaned public history')
  commits=git('log','--format=%an%x00%ae%x00%cn%x00%ce',ANCHOR+'..'+sha).decode().splitlines()
  for row in commits:
   author,email,committer,committer_email=row.split('\0')
   if author!=TEAM or committer!=TEAM or email or committer_email:raise ValueError('New history contains a non-team commit identity')
  for commit in git('rev-list',ANCHOR+'..'+sha).decode().splitlines():
   scan(git('show','-s','--format=%B',commit))
   for path in git('diff-tree','--no-commit-id','--name-only','--diff-filter=ACMR','-r',commit,'-z').split(b'\0'):
    if not path:continue
    name=path.decode()
    if name.startswith(('.data/','.tools/')):raise ValueError('Private runtime history')
    if not name.startswith('engine/agave/'):scan(git('show',commit+':'+name))
def main():
 try:
  mode=sys.argv[1]
  if mode=='stage':identity();changes()
  elif mode=='message':scan(open(sys.argv[2],'rb').read())
  elif mode=='push':push(sys.stdin.read().splitlines())
  else:raise ValueError('Unknown privacy check')
 except (ValueError,subprocess.CalledProcessError) as e:
  print('Privacy guard blocked the operation: '+str(e),file=sys.stderr);return 1
 return 0
if __name__=='__main__':raise SystemExit(main())
