import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('terminal', Path(__file__).with_name('terminal_review.py'))
terminal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(terminal)


class TerminalReview(unittest.TestCase):
    def fixture(self):
        runtime = {key: 'fixture' for key in terminal.IDENTITY}
        freeze = {'candidate': {'apiOrigin': 'https://fixture.example'},
                  'genesis': 'fixture', 'runtime': runtime}
        start = terminal.milliseconds(terminal.START)
        date = lambda ms: terminal.dt.datetime.fromtimestamp(ms / 1000, terminal.dt.timezone.utc).isoformat()
        identifiers = lambda i: '1' * 31 + '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[i % 57] + str(i).replace('0', 'a')
        result = {'genesis': 'fixture', 'candidate': freeze['candidate'], 'runtime': runtime,
                  'passed': True, 'startedAt': terminal.START,
                  'at': date(start + terminal.DURATION + 300), 'durationMs': terminal.DURATION + 300,
                  'smokeEveryMs': 300000, 'observationEveryMs': 30000, 'observations': 2880,
                  'completedJourneys': 288, 'faucetCalls': 0, 'lastSlot': 1000,
                  'prerequisites': [{'name': n, 'at': date(start - 1000)} for n in
                                   ('load', 'backup-check', 'restart-check', 'pilot-agent-one',
                                    'pilot-agent-two', 'monitoring-config', 'frontend-rollback',
                                    'remote-negative-controls')],
                  'journeys': [{'at': date(start + i * 300000), 'durationMs': 10000,
                                'scheduleDelayMs': 0, 'mint': identifiers(i),
                                'recipient': identifiers(500), 'transferSignature': identifiers(i + 1000)}
                               for i in range(288)]}
        observed = date(start + terminal.DURATION + 1000)
        bundle = {'soak': result, 'runtime': runtime,
                  'status': {'fetchedAt': observed, 'checkpoint': {'candidate': freeze['candidate'], 'freezeSha256': 'digest'},
                             'network': {'state': 'online', 'identityMatches': True, 'genesisMatches': True},
                             'soak': {'accepted': True, 'state': 'passed'}},
                  'qa': {'state': 'completed', 'soakAccepted': True, 'exitCode': 0,
                         'signal': None, 'issues': [], 'freezeSha256': 'digest'},
                  'progress': {'result': copy.deepcopy(result), 'freezeSha256': 'digest'},
                  'monitor': {'genesis': 'fixture', 'target': 'https://fixture.example',
                              'overdue': False, 'consecutiveFailures': 0, 'lastProbeAt': observed,
                              'current': {'healthy': True, 'finalizedSlot': 1010}}}
        return bundle, freeze

    def evaluate(self, bundle, freeze):
        return terminal.review(bundle, freeze, 'digest')

    def test_full_matching_terminal_report(self):
        report = self.evaluate(*self.fixture())
        self.assertTrue(report['passed'])
        for key in ('cutoverAccepted', 'releaseAccepted', 'mainnetAccepted', 'bridgeAccepted'):
            self.assertFalse(report[key])

    def test_time_alone_and_numeric_strings_rejected(self):
        for value in (86399999, '86400300', True):
            bundle, freeze = self.fixture()
            bundle['soak']['durationMs'] = value
            with self.assertRaises(ValueError): self.evaluate(bundle, freeze)

    def test_duplicate_or_missing_receipts_rejected(self):
        for kind in ('duplicate', 'missing'):
            bundle, freeze = self.fixture()
            if kind == 'duplicate': bundle['soak']['journeys'][1]['mint'] = bundle['soak']['journeys'][0]['mint']
            else: bundle['soak']['journeys'].pop()
            with self.assertRaises(ValueError): self.evaluate(bundle, freeze)

    def test_wrong_runtime_and_freeze_rejected(self):
        for name in ('runtime', 'qa'):
            bundle, freeze = self.fixture()
            bundle[name] = copy.deepcopy(bundle[name])
            bundle[name]['apiBootId' if name == 'runtime' else 'freezeSha256'] = 'changed'
            with self.assertRaises(ValueError): self.evaluate(bundle, freeze)

    def test_conflicting_terminal_reader_rejected(self):
        bundle, freeze = self.fixture()
        bundle['progress']['result']['passed'] = False
        with self.assertRaises(ValueError): self.evaluate(bundle, freeze)

    def test_stale_and_unhealthy_monitor_rejected(self):
        for change in ({'overdue': True}, {'lastProbeAt': terminal.START}, {'consecutiveFailures': 1}):
            bundle, freeze = self.fixture()
            bundle['monitor'].update(change)
            with self.assertRaises(ValueError): self.evaluate(bundle, freeze)

    def test_schedule_and_incomplete_observations_rejected(self):
        bundle, freeze = self.fixture()
        bundle['soak']['journeys'][2]['scheduleDelayMs'] = 3
        with self.assertRaises(ValueError): self.evaluate(bundle, freeze)
        bundle, freeze = self.fixture()
        bundle['soak']['observations'] = 2879
        with self.assertRaises(ValueError): self.evaluate(bundle, freeze)

    def test_nonterminal_runner_rejected(self):
        bundle, freeze = self.fixture()
        bundle['qa']['state'] = 'starting'
        with self.assertRaises(ValueError): self.evaluate(bundle, freeze)


if __name__ == '__main__': unittest.main()
