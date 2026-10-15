"""Bounded genesis archive admission and fresh private ledger materialization.

Agave genesis archives contain genesis.bin and the initial slot-zero RocksDB.
No extraction API, runtime keys, network, validator or existing-ledger writes.
"""
import bz2,hashlib,io,os,re,stat,tarfile
from pathlib import Path,PurePosixPath
MAX_COMPRESSED=10*1024**2
MAX_PAYLOAD=10*1024**2
MAX_EXPANDED=16*1024**2
MAX_MEMBERS=2048

def _pin(value):
 if not isinstance(value,str) or not re.fullmatch('[0-9a-f]{64}',value):raise ValueError('EXACT_GENESIS_DIGEST_REQUIRED')
 return value

def read_archive(path,archive_sha,genesis_sha):
 _pin(archive_sha);_pin(genesis_sha);path=Path(path)
 if path.is_symlink() or not path.is_file() or path.stat().st_size>MAX_COMPRESSED:raise ValueError('BOUNDED_REGULAR_GENESIS_ARCHIVE_REQUIRED')
 with path.open('rb') as handle:raw=handle.read(MAX_COMPRESSED+1)
 if len(raw)>MAX_COMPRESSED or hashlib.sha256(raw).hexdigest()!=archive_sha:raise ValueError('SELECTED_GENESIS_ARCHIVE_DIFFERS')
 try:
  decoder=bz2.BZ2Decompressor();expanded=decoder.decompress(raw,max_length=MAX_EXPANDED+1)
  if len(expanded)>MAX_EXPANDED or not decoder.eof or decoder.unused_data:raise ValueError('BOUNDED_SINGLE_GENESIS_STREAM_REQUIRED')
  rows=[];files={};seen=set();total=0
  with tarfile.open(fileobj=io.BytesIO(expanded),mode='r:') as archive:
   for item in archive:
    if len(rows)>=MAX_MEMBERS:raise ValueError('GENESIS_ARCHIVE_MEMBER_LIMIT')
    name=item.name.rstrip('/') if item.isdir() else item.name
    parts=PurePosixPath(name).parts
    if not name or name.startswith('/') or '\\' in name or any(c in name for c in ['\x00','\n','\r']) or not parts or any(p in ['.','..'] for p in parts) or '/'.join(parts)!=name or name in seen:raise ValueError('CANONICAL_GENESIS_MEMBER_REQUIRED')
    if not (name=='genesis.bin' and item.isfile() or parts[0]=='rocksdb' and (item.isfile() or item.isdir())) or item.issparse() or item.islnk() or item.issym():raise ValueError('GENESIS_AND_SLOT_ZERO_BLOCKSTORE_ONLY')
    if name=='rocksdb' and not item.isdir():raise ValueError('SLOT_ZERO_DIRECTORY_REQUIRED')
    if item.size<0 or item.size>MAX_PAYLOAD:raise ValueError('GENESIS_ARCHIVE_PAYLOAD_LIMIT')
    total+=item.size
    if total>MAX_PAYLOAD:raise ValueError('GENESIS_ARCHIVE_PAYLOAD_LIMIT')
    seen.add(name);row={'name':name,'directory':item.isdir(),'bytes':item.size}
    if item.isfile():
     source=archive.extractfile(item)
     if source is None:raise ValueError('REGULAR_GENESIS_PAYLOAD_REQUIRED')
     data=source.read(item.size+1)
     if len(data)!=item.size:raise ValueError('COMPLETE_GENESIS_PAYLOAD_REQUIRED')
     row['sha256']=hashlib.sha256(data).hexdigest();files[name]=data
    rows.append(row)
  if 'genesis.bin' not in files or hashlib.sha256(files['genesis.bin']).hexdigest()!=genesis_sha:raise ValueError('ARCHIVED_GENESIS_BIN_DIFFERS')
  if not any(n.startswith('rocksdb/') for n in files):raise ValueError('INITIAL_SLOT_ZERO_BLOCKSTORE_REQUIRED')
  for name in seen:
   for parent in PurePosixPath(name).parents:
    if str(parent)!='.' and str(parent) in files:raise ValueError('GENESIS_FILE_DIRECTORY_COLLISION')
  return raw,files,sorted(rows,key=lambda r:r['name'])
 except (OSError,EOFError,tarfile.TarError) as e:raise ValueError('INVALID_GENESIS_ARCHIVE') from e

def inspect_archive(path,archive_sha,genesis_sha):
 _,files,rows=read_archive(path,archive_sha,genesis_sha)
 return {'archiveSHA256':archive_sha,'genesisBinSHA256':genesis_sha,'regularFiles':len(files),'payloadBytes':sum(len(v) for v in files.values()),'initialBlockstoreFiles':sum(n.startswith('rocksdb/') for n in files),'members':rows}

def materialize(path,destination,archive_sha,genesis_sha):
 raw,files,rows=read_archive(path,archive_sha,genesis_sha)
 destination=Path(destination)
 if destination.exists() or destination.is_symlink():raise ValueError('FRESH_LEDGER_DIRECTORY_REQUIRED')
 if not destination.parent.is_dir() or any(p.is_symlink() for p in destination.parents):raise ValueError('PRIVATE_LEDGER_PARENT_REQUIRED')
 destination.mkdir(mode=0o700)
 # Fully validate before writing; never trust archive modes, links or extraction.
 for name,data in sorted(files.items()):
  target=destination/name
  parent=destination
  for part in PurePosixPath(name).parts[:-1]:
   parent=parent/part;parent.mkdir(mode=0o700,exist_ok=True)
  with target.open('xb') as out:os.fchmod(out.fileno(),0o600);out.write(data)
 with (destination/'genesis.tar.bz2').open('xb') as out:os.fchmod(out.fileno(),0o600);out.write(raw)
 for name,data in files.items():
  target=destination/name
  if target.is_symlink() or not stat.S_ISREG(target.stat().st_mode) or hashlib.sha256(target.read_bytes()).hexdigest()!=hashlib.sha256(data).hexdigest():raise ValueError('MATERIALIZED_GENESIS_DIFFERS')
 return {'genesisBinSHA256':genesis_sha,'initialBlockstoreFiles':sum(n.startswith('rocksdb/') for n in files),'regularFiles':len(files),'archiveSHA256':archive_sha,'freshLedger':True}
