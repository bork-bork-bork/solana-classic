import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('worker', Path(__file__).with_name('worker.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class BoundaryTests(unittest.TestCase):
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
