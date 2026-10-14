import copy
import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('load_review', Path(__file__).with_name('load_review.py'))
load_review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(load_review)


class RecordedLoad(unittest.TestCase):
    def fixture(self):
        root = Path(__file__).resolve().parents[2]
        return (json.loads((root / 'evidence/load.json').read_text()),
                json.loads((root / 'evidence/candidate-freeze.json').read_text()))

    def test_recorded_load_recomputed_without_release(self):
        review = load_review.review(*self.fixture())
        self.assertEqual(review['metrics']['p95LogicalConfirmedMs'], 3150)
        self.assertEqual(review['galleryVerificationMaxMs'], 18152)
        self.assertEqual(review['uniqueSignatures'], 200)
        self.assertFalse(review['releaseAccepted'])
        self.assertFalse(review['abuse429Reexecuted'])

    def test_forged_aggregate_and_boolean_metrics(self):
        for value in (1, True, 0, float('inf')):
            load, freeze = self.fixture()
            load['metrics']['p95LogicalConfirmedMs'] = value
            with self.assertRaises(ValueError): load_review.review(load, freeze)

    def test_missing_operation_and_duplicate_receipt(self):
        load, freeze = self.fixture()
        load['results'].pop()
        with self.assertRaises(ValueError): load_review.review(load, freeze)
        load, freeze = self.fixture()
        load['results'][1]['signatures'] = copy.deepcopy(load['results'][0]['signatures'])
        load['results'][1]['confirmedSignatures'] = copy.deepcopy(load['results'][0]['signatures'])
        with self.assertRaises(ValueError): load_review.review(load, freeze)

    def test_repeated_confirmation_does_not_increase_credit(self):
        load, freeze = self.fixture()
        load['results'][0]['confirmedSignatures'] *= 2
        with self.assertRaises(ValueError): load_review.review(load, freeze)

    def test_bad_receipt_and_unsafe_times_rejected(self):
        for change in ({'confirmedMs': '3000'}, {'confirmedMs': True},
                       {'confirmedMs': -1}, {'finalizedMs': 2**53},
                       {'signatures': ['1' * 32], 'confirmedSignatures': ['1' * 32]}):
            load, freeze = self.fixture()
            load['results'][0].update(change)
            with self.assertRaises(ValueError): load_review.review(load, freeze)

    def test_wrong_candidate_and_boots_rejected(self):
        for target, key in [('candidate', 'apiCommit'), ('candidateRuntime', 'apiBootId')]:
            load, freeze = self.fixture()
            load[target][key] = 'changed'
            with self.assertRaises(ValueError): load_review.review(load, freeze)

    def test_gallery_and_cadence_are_independent_gates(self):
        load, freeze = self.fixture()
        load['results'][0]['galleryVerifiedMs'] = 60001
        with self.assertRaises(ValueError): load_review.review(load, freeze)
        load, freeze = self.fixture()
        load['results'][2]['startedAt'] = load['results'][0]['startedAt']
        with self.assertRaises(ValueError): load_review.review(load, freeze)

    def test_seed_or_session_count_cannot_be_claimed(self):
        for count in (True, 19, '20'):
            load, freeze = self.fixture()
            load['workload']['sessions'] = count
            with self.assertRaises(ValueError): load_review.review(load, freeze)
        load, freeze = self.fixture()
        load['workload']['preparationMintsExcluded'][1] = load['workload']['preparationMintsExcluded'][0]
        with self.assertRaises(ValueError): load_review.review(load, freeze)


if __name__ == '__main__': unittest.main()
