import importlib.util
import unittest
import socket
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('worker', Path(__file__).with_name('worker.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class BoundaryTests(unittest.TestCase):
    def test_cold_copy_skips_only_admin_socket_and_rebases_snapshot_links(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'ledger'; source.mkdir()
            accounts = source / 'accounts'; accounts.mkdir(); (accounts / 'state').write_bytes(b'fixture-state')
            (source / 'snapshot-link').symlink_to(accounts)
            connection = socket.socket(socket.AF_UNIX); connection.bind(str(source / 'admin.rpc'))
            try:
                backup = Path(directory) / 'backup'; worker.copy_cold_ledger(source, backup)
                restored = Path(directory) / 'restored'; worker.copy_cold_ledger(backup, restored)
                self.assertFalse((backup / 'admin.rpc').exists())
                self.assertEqual((restored / 'snapshot-link').resolve(), (restored / 'accounts').resolve())
                self.assertEqual((restored / 'snapshot-link/state').read_bytes(), b'fixture-state')
            finally:
                connection.close()

    def test_cold_snapshot_link_matches_agave_literal_account_run_path(self):
        with tempfile.TemporaryDirectory() as directory:
            source = (Path(directory) / 'ledger').resolve(); source.mkdir()
            target = source / 'accounts/snapshot/100'; target.mkdir(parents=True)
            (target / '100.0').write_bytes(b'appendvec-fixture')
            links = source / 'snapshots/100/accounts_hardlinks'; links.mkdir(parents=True)
            (links / 'account_path_0').symlink_to(target)
            backup = Path(directory) / 'backup'; worker.copy_cold_ledger(source, backup)
            restored = Path(directory) / 'restored'; worker.copy_cold_ledger(backup, restored)
            # runtime/src/snapshot_utils.rs computes this from read_link(),
            # then compares it directly against the configured account run path.
            literal = (restored / 'snapshots/100/accounts_hardlinks/account_path_0').readlink()
            self.assertTrue(literal.is_absolute())
            self.assertEqual(literal.parent.parent / 'run', restored.resolve() / 'accounts/run')
            self.assertEqual((literal / '100.0').read_bytes(), b'appendvec-fixture')

    def test_cold_copy_rejects_links_outside_ledger(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'ledger'; source.mkdir()
            (source / 'escape').symlink_to(Path(directory) / 'outside')
            with self.assertRaises(RuntimeError):
                worker.copy_cold_ledger(source, Path(directory) / 'backup')

    def test_production_and_public_genesis_rejected(self):
        for genesis in {*worker.PUBLIC_GENESIS, worker.CANONICAL_GENESIS, None, '', 'http://example.com'}:
            with self.assertRaises(RuntimeError):
                worker.admit_genesis(genesis)

    def test_public_status_never_exports_private_fields(self):
        worker.STATE.clear()
        worker.STATE.update({'runId': 'fixture', 'runDirectory': '/data/private', 'rawLog': 'fixture-secret', 'privateKey': 'fixture-secret', 'state': 'failed', 'passed': False})
        public = worker.public_state()
        self.assertNotIn('runDirectory', public)
        self.assertNotIn('privateKey', public)
        self.assertNotIn('rawLog', public)
        self.assertFalse(public['productionNetworkChanged'])
        self.assertFalse(public['cutoverAccepted'])

    def test_unbound_source_manifest_rejected_before_reading_source(self):
        for source in ['bad-commit', worker.EXPECTED_COMMIT]:
            with self.assertRaises(RuntimeError):
                worker.check_source({'upstreamCommit': source, 'upstreamTree': 'bad-tree', 'files': {}})

if __name__ == '__main__':
    unittest.main()
