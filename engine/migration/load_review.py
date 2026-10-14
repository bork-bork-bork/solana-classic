"""Recalculate original remote load evidence without rerunning a workload.

No RPC, signing, keys, mutations, restarts or release approval. A valid report
checks recorded receipt integrity, not independent replay of chain history.
"""
import datetime
import hashlib
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location('terminal_review', Path(__file__).with_name('terminal_review.py'))
_terminal = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_terminal)
require, integer, milliseconds = _terminal.require, _terminal.integer, _terminal.milliseconds
ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'


def identifier(value, size):
    require(isinstance(value, str) and 32 <= len(value) <= 88, 'Invalid public identifier')
    number = 0
    for char in value:
        require(char in ALPHABET, 'Invalid base58 identifier')
        number = number * 58 + ALPHABET.index(char)
    decoded = (number.bit_length() + 7) // 8 + len(value) - len(value.lstrip('1'))
    require(decoded == size, 'Incorrect public identifier byte length')
    return value


def percentile(values, fraction):
    return sorted(values)[math.ceil(len(values) * fraction) - 1]


def review(load, freeze):
    require(load.get('passed') is True and load.get('genesis') == freeze['genesis'] and
            load.get('candidate') == freeze['candidate'] and
            load.get('candidateRuntime') == freeze['runtime'], 'Load belongs to another candidate')
    require(load.get('runtimeStable') is True and load.get('cadencePassed') is True and
            load.get('galleryPassed') is True and integer(load.get('observations'), 40),
            'Load integrity observations incomplete')
    workload = load.get('workload', {})
    for key, expected in {'sessions': 20, 'issuances': 100, 'transfers': 100,
                          'startEveryMs': 6000, 'pollingMs': 3000,
                          'issuanceTransactionsPerOperation': 1, 'faucetCalls': 0}.items():
        require(type(workload.get(key)) is int and workload[key] == expected, 'Wrong workload: ' + key)
    require(workload.get('unchangedAdmissionLimits') is True and
            workload.get('issuanceTypes') == ['meme', 'nft'], 'Workload admission or asset types changed')
    seeds = workload.get('preparationMintsExcluded')
    require(isinstance(seeds, list) and len(seeds) == 20 and
            len({identifier(seed, 32) for seed in seeds}) == 20, 'Seed inventory incomplete or duplicated')
    rows = load.get('results')
    require(isinstance(rows, list) and len(rows) == 200, 'Wrong logical-operation denominator')
    started, finished = milliseconds(load['startedAt']), milliseconds(load['at'])
    require(integer(load.get('durationMs'), 1_200_000) and
            finished - started == load['durationMs'], 'Load duration not established')
    confirmations, finalizations, gallery, signatures, indices, delays = [], [], [], set(), set(), []
    for row in rows:
        index = row.get('index')
        require(integer(index) and index < 200 and index not in indices, 'Duplicate or invalid operation index')
        indices.add(index)
        expected_kind = 'issuance' if index % 2 == 0 else 'transfer'
        require(row.get('kind') == expected_kind and row.get('passed') is True and
                not row.get('error'), 'Failed or misclassified logical operation')
        observed = milliseconds(row['startedAt'])
        delay = observed - started - index * 6000
        # The frozen runner permits up to one second on either side of the
        # schedule; setTimeout can wake a millisecond before its target.
        require(abs(delay) <= 1000, 'Logical-operation cadence changed')
        delays.append(delay)
        confirmed, finalized = row.get('confirmedMs'), row.get('finalizedMs')
        require(integer(confirmed) and integer(finalized) and confirmed <= finalized and
                observed + finalized <= finished, 'Invalid confirmation or finalization timing')
        receipts, confirmed_receipts = row.get('signatures'), row.get('confirmedSignatures')
        require(isinstance(receipts, list) and len(receipts) == 1 and
                confirmed_receipts == receipts, 'Missing or duplicated confirmation credit')
        receipt = identifier(receipts[0], 64)
        require(receipt not in signatures, 'Receipt reused across logical operations')
        signatures.add(receipt)
        confirmations.append(confirmed)
        finalizations.append(finalized)
        if expected_kind == 'issuance':
            verified = row.get('galleryVerifiedMs')
            require(integer(verified) and finalized <= verified <= 60000 and
                    observed + verified <= finished, 'Gallery verification timing invalid')
            gallery.append(verified)
        else:
            require(row.get('galleryVerifiedMs') is None, 'Transfer counted as gallery issuance')
    recomputed = {'successfulWithin15Seconds': sum(t <= 15000 for t in confirmations) / 200,
                  'p95LogicalConfirmedMs': percentile(confirmations, .95), 'missingConfirmations': 0,
                  'p95LogicalFinalizedMs': percentile(finalizations, .95), 'failures': 0}
    claimed = load.get('metrics')
    require(isinstance(claimed, dict) and claimed.keys() == recomputed.keys() and
            all(type(claimed[key]) in (int, float) and math.isfinite(claimed[key]) and
                claimed[key] == value for key, value in recomputed.items()),
            'Claimed aggregate differs from individual measurements')
    require(recomputed['successfulWithin15Seconds'] >= .99 and
            recomputed['p95LogicalConfirmedMs'] <= 5000, 'Confirmation acceptance target unmet')
    return {'schemaVersion': 1, 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'scope': 'remote original frozen load evidence review; recorded receipt/timing integrity, not independent chain replay or a new workload',
            'passed': True, 'genesis': freeze['genesis'], 'candidate': freeze['candidate'],
            'candidateRuntime': freeze['runtime'], 'recordedAt': load['at'],
            'startedAt': load['startedAt'], 'durationMs': load['durationMs'],
            'operations': 200, 'issuances': 100, 'transfers': 100, 'sessions': 20,
            'uniqueSignatures': len(signatures), 'maxScheduleDelayMs': max(delays),
            'maxAbsScheduleDeviationMs': max(abs(value) for value in delays),
            'metrics': recomputed, 'confirmedLatencyMs': {name: percentile(confirmations, q)
                for name, q in [('p50', .5), ('p95', .95), ('p99', .99), ('max', 1)]},
            'galleryVerificationMaxMs': max(gallery), 'observations': load['observations'],
            'faucetCalls': 0, 'supportedRequirements': ['G6.01', 'G6.02', 'G6.03', 'G6.04'],
            'abuse429Reexecuted': False, 'productionNetworkChanged': False,
            'releaseAccepted': False, 'cutoverAccepted': False,
            'limitations': ['Twenty recorded SDK sessions on one validator, not chain-wide capacity.',
                            'Signatures/times checked from retained evidence, not replayed from pruned RPC history.',
                            'Does not certify later frontend signing, uploads, migration or mainnet.']}


def main():
    raw = _terminal.public_file(ROOT / 'evidence/load.json')
    freeze_raw = _terminal.public_file(ROOT / 'evidence/candidate-freeze.json')
    freeze = json.loads(freeze_raw)
    require(all(hashlib.sha256(_terminal.public_file(ROOT / path)).hexdigest() == expected
                for path, expected in freeze['coreFiles'].items()), 'Frozen source changed')
    report = review(json.loads(raw), freeze)
    report['loadSHA256'] = hashlib.sha256(raw).hexdigest()
    report['freezeSHA256'] = hashlib.sha256(freeze_raw).hexdigest()
    report['frozenFileCount'] = len(freeze['coreFiles'])
    report['auditorSHA256'] = hashlib.sha256(_terminal.public_file(Path(__file__))).hexdigest()
    print(json.dumps(report, indent=2))


if __name__ == '__main__': main()
