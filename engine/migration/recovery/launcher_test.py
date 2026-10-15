"""Recovery admission and extraction negatives; no remote actions or validator."""
import gzip, hashlib, importlib.util, io, json, os, sqlite3, tarfile, tempfile, unittest
from unittest.mock import patch
from pathlib import Path
spec = importlib.util.spec_from_file_location('recovery_launcher', Path(__file__).with_name('launcher.py'))
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)

class RecoveryTests(unittest.TestCase):
    def environment(self):
        return {'RAILWAY_PROJECT_ID': r.PROJECT, 'RAILWAY_ENVIRONMENT_ID': r.ENVIRONMENT, 'RAILWAY_SERVICE_ID': r.WORKER, 'RAILWAY_VOLUME_MOUNT_PATH': '/data'}
    def test_canonical_service_and_modes_rejected(self):
        r.admit_environment(self.environment())
        for key, value in [('RAILWAY_SERVICE_ID', r.CANONICAL), ('RAILWAY_PROJECT_ID', 'wrong'), ('RAILWAY_VOLUME_MOUNT_PATH', '/other'), ('SC_OPERATION', 'cold-restore'), ('SC_MIGRATION_MODE', 'canonical-testnet'), ('SC_QA_PREFUND', 'load-soak')]:
            env = self.environment(); env[key] = value
            with self.assertRaises(ValueError): r.admit_environment(env)
    def test_exclusive_attempt_preserves_previous(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory).resolve() / 'attempts'; attempt = '11111111-1111-4111-8111-111111111111'
            first = r.new_attempt(parent, attempt); marker = first / 'retained'; marker.write_text('preserve')
            with self.assertRaises(FileExistsError): r.new_attempt(parent, attempt)
            self.assertEqual(marker.read_text(), 'preserve')
            with self.assertRaises(ValueError): r.new_attempt(parent, '../escape')
    def test_symlink_and_public_input_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); file = root / 'input'; file.write_text('private'); file.chmod(0o600)
            r.regular(file, 100, True); link = root / 'link'; link.symlink_to(file)
            with self.assertRaises(ValueError): r.regular(link, 100, True)
            file.chmod(0o644)
            with self.assertRaises(ValueError): r.regular(file, 100, True)
    def member(self, name, kind=tarfile.REGTYPE, link='', size=0):
        member = tarfile.TarInfo(name); member.type = kind; member.linkname = link; member.size = size; return member
    def test_archive_traversal_special_duplicate_and_expansion(self):
        for members in [[self.member('../escape')], [self.member('/app/file')], [self.member('ledger/socket', tarfile.FIFOTYPE)], [self.member('ledger/a'), self.member('ledger/a')], [self.member('ledger/a', size=r.MAX_EXTRACTED+1)]]:
            with self.assertRaises(ValueError): r.validate_members(members)
    def test_snapshot_and_hardlink_targets_are_bounded(self):
        for member in [self.member('ledger/link', tarfile.SYMTYPE, '/data/ledger'), self.member('ledger/accounts/snapshot/1/1.1', tarfile.LNKTYPE, 'app/key'), self.member('ledger/snapshots/1/accounts_hardlinks/account_path_0', tarfile.SYMTYPE, '/data/ledger/accounts/snapshot/1')]:
            with self.assertRaises(ValueError): r.validate_members([member])
    def test_extraction_rebases_links_and_excludes_operator(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); archive = root / 'small.tar.gz'; dest = root / 'copy'
            members = [self.member('ledger/accounts/run/1.1', size=3), self.member('ledger/accounts/snapshot/1', tarfile.DIRTYPE), self.member('ledger/accounts/snapshot/1/1.1', tarfile.LNKTYPE, 'ledger/accounts/run/1.1'), self.member('ledger/snapshots/1/accounts_hardlinks/account_path_0', tarfile.SYMTYPE, '/data/ledger/accounts/snapshot/1'), self.member('operator/secret', size=3)]
            with tarfile.open(archive, 'w:gz') as tar:
                for member in members: tar.addfile(member, io.BytesIO(b'abc') if member.isfile() else None)
            r.extract(archive, dest)
            self.assertFalse((dest/'operator').exists())
            link = dest/'ledger/snapshots/1/accounts_hardlinks/account_path_0'
            snapshot_path = Path(os.readlink(link))
            self.assertTrue(snapshot_path.is_absolute())
            self.assertEqual(snapshot_path, dest/'ledger/accounts/snapshot/1')
            self.assertEqual(snapshot_path.parent.parent/'run', dest/'ledger/accounts/run')
            self.assertEqual((dest/'ledger/snapshots/1/accounts_hardlinks/account_path_0/1.1').read_bytes(), b'abc')
            self.assertEqual((dest/'ledger/accounts/run/1.1').stat().st_mode & 0o777, 0o600)
            with self.assertRaises(ValueError): r.extract(archive, dest)
    def test_application_inventory_catches_row_and_file_change(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory).resolve()
            with sqlite3.connect(app/'app.sqlite') as db: db.execute('CREATE TABLE gallery(value TEXT)'); db.execute('INSERT INTO gallery VALUES(?)', ('real',))
            (app/'art').write_text('immutable'); before = r.app_inventory(app)
            (app/'art').write_text('altered'); self.assertNotEqual(before, r.app_inventory(app))
            (app/'art').write_text('immutable')
            with sqlite3.connect(app/'app.sqlite') as db: db.execute('UPDATE gallery SET value=?', ('changed',))
            self.assertNotEqual(before, r.app_inventory(app))
    def test_all_user_account_fields_exact_and_only_named_protocol_data_may_advance(self):
        original = {'bytes': 0, 'dataSHA256': 'a', 'owner': '11111111111111111111111111111111', 'lamports': '1000000000', 'rentEpoch': '0', 'executable': False}
        for field, value in [('lamports', '999999999'), ('owner', 'changed'), ('dataSHA256', 'changed'), ('executable', True)]:
            changed = dict(original); changed[field] = value
            with self.assertRaises(ValueError): r.compare_known_account('ordinary', original, changed)
        sysvar = dict(original, owner='Sysvar1111111111111111111111111111111111111')
        key = 'SysvarC1ock11111111111111111111111111111111'
        self.assertEqual(r.compare_known_account(key, sysvar, dict(sysvar, dataSHA256='changed')), ['dataSHA256'])
        with self.assertRaises(ValueError): r.compare_known_account(key, sysvar, dict(sysvar, lamports='1'))
    def test_lossless_account_integers_and_changed_fee_boundary(self):
        data = {'data':['', 'base64'], 'lamports':2**53+1, 'rentEpoch':2**64-1, 'executable':False, 'owner':'11111111111111111111111111111111'}
        fields = r.account_fields(data); self.assertEqual(fields['lamports'], str(2**53+1))
        with self.assertRaises(ValueError): r.account_fields(dict(data, lamports=True))
        with self.assertRaises(ValueError): r.compare_known_account(r.FEE_IDENTITY, fields, dict(fields, lamports=str(2**53+1+1000000001)))

    def test_compressed_and_raw_integrity_are_independently_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory).resolve() / 'archive.gz'; raw = b'real stopped archive bytes'; archive.write_bytes(gzip.compress(raw)); archive.chmod(0o600)
            pins = {'ARCHIVE_BYTES':archive.stat().st_size, 'ARCHIVE_SHA':r.sha(archive), 'RAW_BYTES':len(raw), 'RAW_SHA':hashlib.sha256(raw).hexdigest()}
            with patch.multiple(r, **pins): r.verify_archive(archive)
            for field, value in [('ARCHIVE_SHA','0'*64), ('RAW_SHA','0'*64), ('RAW_BYTES',len(raw)-1)]:
                changed = dict(pins); changed[field] = value
                with patch.multiple(r, **changed):
                    with self.assertRaises(ValueError): r.verify_archive(archive)

    def test_no_reset_bypass_or_canonical_ports(self):
        command = r.command(Path('/data/classic-recovery/fixture/restored'))
        self.assertNotIn('--reset', command); self.assertNotIn('--ignore-ulimit-nofile-error', command)
        self.assertNotIn('8899', command); self.assertIn('127.0.0.1', command)

if __name__ == '__main__': unittest.main()
