import importlib.util,unittest,tempfile,socket,tarfile,io
from pathlib import Path
s=importlib.util.spec_from_file_location('cold_copy',Path(__file__).with_name('cold_copy.py'));c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
class ColdCopies(unittest.TestCase):
    def test_absolute_snapshot_links_rebase_without_original_reads(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);src=r/'source';src.mkdir();(src/'accounts').mkdir();(src/'accounts/state').write_bytes(b'ledger-state');(src/'snapshot').symlink_to(src/'accounts/state')
            a=c.copy_cold_ledger(src,r/'copy');assert (r/'copy/snapshot').readlink().is_absolute();self.assertEqual((r/'copy/snapshot').resolve(),(r/'copy/accounts/state').resolve());self.assertEqual(a,c.inventory(src)[0])
    def test_escape_missing_link_and_overlapping_destination_reject_before_copy(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);src=r/'source';src.mkdir();(r/'external').write_bytes(b'outside');link=src/'link';link.symlink_to(r/'external')
            with self.assertRaises(AssertionError):c.copy_cold_ledger(src,r/'bad')
            self.assertFalse((r/'bad').exists());link.unlink();link.symlink_to(src/'missing')
            with self.assertRaises(AssertionError):c.copy_cold_ledger(src,r/'bad')
            link.unlink()
            with self.assertRaises(AssertionError):c.copy_cold_ledger(src,src/'nested')
    def test_only_transient_admin_socket_is_omitted(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);src=r/'source';src.mkdir();sock=socket.socket(socket.AF_UNIX);sock.bind(str(src/'admin.rpc'))
            try:c.copy_cold_ledger(src,r/'copy');self.assertFalse((r/'copy/admin.rpc').exists())
            finally:sock.close()
            extra=socket.socket(socket.AF_UNIX);extra.bind(str(src/'unknown.sock'))
            try:
                with self.assertRaises(AssertionError):c.inventory(src)
            finally:extra.close()
    def test_archive_extraction_and_rebased_restore_match_stopped_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);backup=r/'backup';backup.mkdir()
            for i in range(2):
                p=backup/('ledger-'+str(i));p.mkdir();(p/'state').write_bytes(b'exact');(p/'snapshot').symlink_to(p/'state')
            info=c.archive_backup(backup,r/'private.tar');extracted=c.extract_backup(r/'private.tar',r/'extracted',info['sha256'])
            for i in range(2):self.assertEqual(extracted[i],c.copy_cold_ledger(r/'extracted'/('ledger-'+str(i)),r/('restored-'+str(i))))
            with self.assertRaises(AssertionError):c.extract_backup(r/'private.tar',r/'another','0'*64)
    def test_archive_traversal_and_external_links_refused(self):
        for name,link in [('../escape',None),('ledger-0/link','../../escape'),('ledger-0/link','/absolute')]:
            with tempfile.TemporaryDirectory() as d:
                r=Path(d);p=r/'bad.tar'
                with tarfile.open(p,'w') as t:
                    m=tarfile.TarInfo(name)
                    if link:m.type=tarfile.SYMTYPE;m.linkname=link
                    else:m.size=1
                    t.addfile(m,io.BytesIO(b'x') if not link else None)
                with self.assertRaises(AssertionError):c.extract_backup(p,r/'out',c.sha(p))
                self.assertFalse((r/'out').exists())
    def test_archive_cannot_write_below_a_symlink(self):
        with tempfile.TemporaryDirectory() as d:
            r=Path(d);p=r/'bad.tar'
            with tarfile.open(p,'w') as t:
                m=tarfile.TarInfo('ledger-0/link');m.type=tarfile.SYMTYPE;m.linkname='target';t.addfile(m)
                m=tarfile.TarInfo('ledger-0/link/file');m.size=1;t.addfile(m,io.BytesIO(b'x'))
            with self.assertRaises(AssertionError):c.extract_backup(p,r/'out',c.sha(p))
            self.assertFalse((r/'out').exists())
if __name__=='__main__':unittest.main()
