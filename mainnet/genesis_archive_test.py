import bz2,hashlib,importlib.util,io,os,stat,tarfile,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('genesis_archive',Path(__file__).with_name('genesis_archive.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def sha(x):return hashlib.sha256(x).hexdigest()
def tar(rows):
 output=io.BytesIO()
 with tarfile.open(fileobj=output,mode='w:') as archive:
  for name,data,kind in rows:
   item=tarfile.TarInfo(name);item.mode=0o777;item.type=kind;item.size=len(data) if kind==tarfile.REGTYPE else 0
   if kind in [tarfile.SYMTYPE,tarfile.LNKTYPE]:item.linkname='outside'
   archive.addfile(item,io.BytesIO(data) if item.isfile() else None)
 return bz2.compress(output.getvalue())
GOOD=[('genesis.bin',b'genesis',tarfile.REGTYPE),('rocksdb/',b'',tarfile.DIRTYPE),('rocksdb/CURRENT',b'MANIFEST-000001',tarfile.REGTYPE),('rocksdb/MANIFEST-000001',b'slot-zero',tarfile.REGTYPE)]
class GenesisArchive(unittest.TestCase):
 def inspect(self,rows,genesis=sha(b'genesis')):
  with tempfile.TemporaryDirectory() as tmp:
   raw=tar(rows);p=Path(tmp)/'archive';p.write_bytes(raw);return m.inspect_archive(p,sha(raw),genesis)
 def test_archive_contains_same_pinned_genesis_and_initial_blockstore(self):
  result=self.inspect(GOOD);self.assertEqual(result['initialBlockstoreFiles'],2);self.assertEqual(result['regularFiles'],3)
 def test_two_genesis_files_are_not_a_bootstrappable_blockstore(self):
  with self.assertRaisesRegex(ValueError,'INITIAL_SLOT_ZERO'):self.inspect(GOOD[:1])
 def test_archived_genesis_must_match_selected_standalone_genesis(self):
  with self.assertRaisesRegex(ValueError,'ARCHIVED_GENESIS'):self.inspect(GOOD,sha(b'other'))
 def test_absolute_traversal_duplicate_noncanonical_and_unrelated_members_refuse(self):
  for name in ['/outside','../outside','rocksdb/../../outside','rocksdb/./CURRENT','rocksdb//CURRENT','genesis.bin','accounts/key.json','rocksdb/back\\slash','rocksdb/bad\nname']:
   with self.subTest(name=name),self.assertRaises(ValueError):self.inspect(GOOD+[(name,b'x',tarfile.REGTYPE)])
 def test_links_special_files_and_file_directory_collisions_refuse(self):
  for kind in [tarfile.SYMTYPE,tarfile.LNKTYPE,tarfile.FIFOTYPE,tarfile.CHRTYPE]:
   with self.subTest(kind=kind),self.assertRaises(ValueError):self.inspect(GOOD+[('rocksdb/link',b'',kind)])
  with self.assertRaises(ValueError):self.inspect(GOOD+[('rocksdb/CURRENT/child',b'x',tarfile.REGTYPE)])
 def test_payload_member_expansion_and_compressed_bounds_are_enforced(self):
  for field,value in [('MAX_PAYLOAD',4),('MAX_MEMBERS',2),('MAX_EXPANDED',1024),('MAX_COMPRESSED',1)]:
   with patch.object(m,field,value),self.assertRaises(ValueError):self.inspect(GOOD)
 def test_incomplete_concatenated_or_wrong_pinned_streams_refuse(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'archive';good=tar(GOOD)
   for raw in [good[:-10],good+good,b'bad']:
    p.write_bytes(raw)
    with self.assertRaises(ValueError):m.inspect_archive(p,sha(raw),sha(b'genesis'))
   p.write_bytes(good)
   with self.assertRaisesRegex(ValueError,'SELECTED'):m.inspect_archive(p,'0'*64,sha(b'genesis'))
 def test_materialize_creates_only_owner_readable_genesis_and_slot_zero_files(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp).resolve();raw=tar(GOOD+[('rocksdb/nested/deep/data',b'slot-zero',tarfile.REGTYPE)]);source=base/'archive';source.write_bytes(raw);target=base/'new-ledger'
   result=m.materialize(source,target,sha(raw),sha(b'genesis'));self.assertTrue(result['freshLedger'])
   self.assertEqual((target/'rocksdb/CURRENT').read_bytes(),b'MANIFEST-000001');self.assertEqual((target/'genesis.bin').read_bytes(),b'genesis');self.assertEqual((target/'genesis.tar.bz2').read_bytes(),raw)
   for p in target.rglob('*'):self.assertEqual(stat.S_IMODE(p.stat().st_mode),0o700 if p.is_dir() else 0o600)
   self.assertEqual(stat.S_IMODE(target.stat().st_mode),0o700)
   with self.assertRaisesRegex(ValueError,'FRESH_LEDGER'):m.materialize(source,target,sha(raw),sha(b'genesis'))
 def test_invalid_archive_writes_nothing_and_symlink_parent_refuses(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp).resolve();raw=tar(GOOD);source=base/'archive';source.write_bytes(raw);target=base/'new-ledger'
   with self.assertRaises(ValueError):m.materialize(source,target,'0'*64,sha(b'genesis'))
   self.assertFalse(target.exists());(base/'alias').symlink_to(base,target_is_directory=True)
   with self.assertRaisesRegex(ValueError,'PRIVATE_LEDGER_PARENT'):m.materialize(source,base/'alias/new-ledger',sha(raw),sha(b'genesis'))
 def test_symlink_archive_refuses_without_reading_target(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'link';p.symlink_to(Path(tmp)/'missing')
   with self.assertRaisesRegex(ValueError,'REGULAR'):m.inspect_archive(p,'0'*64,'1'*64)
if __name__=='__main__':unittest.main()
