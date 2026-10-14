"""Offline review and exclusive archive of the original browser soak's public evidence.

No network access, signing, process controls, runtime writes or release approval.
The report verifies recorded observations, not independent replay of transactions.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat

ROOT = Path(__file__).resolve().parents[2]
START = '2026-10-13T16:48:22.762Z'
DURATION = 86_400_000
FILES = ('soak', 'status', 'runtime', 'qa', 'progress', 'monitor')
IDENTITY = ('genesis', 'sourceCommit', 'coreSha256', 'apiBootId',
            'validatorBootId', 'deploymentId', 'agaveVersion',
            'tokenProgramVersion', 'tokenProgramSha256')


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def milliseconds(value):
    require(isinstance(value, str), 'Invalid evidence time')
    date = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(date.tzinfo is not None, 'Unzoned evidence time')
    return round(date.timestamp() * 1000)


def integer(value, minimum=0):
    return type(value) is int and minimum <= value <= 2**53 - 1


def review(bundle, freeze, freeze_sha):
    result, status, runtime, qa, progress, monitor = (bundle[name] for name in FILES)
    expected = freeze['runtime']
    candidate = freeze['candidate']
    observed_at = milliseconds(status['fetchedAt'])
    require(status['checkpoint']['candidate'] == candidate, 'Status candidate changed')
    require(result.get('genesis') == freeze['genesis'] and
            result.get('candidate') == candidate and result.get('runtime') == expected,
            'Terminal candidate or runtime changed')
    require(all(runtime.get(key) == expected[key] for key in IDENTITY),
            'Current runtime differs from the original boots or binaries')
    require(status['network']['identityMatches'] is True and
            status['network']['genesisMatches'] is True and
            status['network']['state'] == 'online', 'Network identity unavailable')
    require(qa.get('state') == 'completed' and qa.get('soakAccepted') is True and
            qa.get('exitCode') == 0 and qa.get('signal') is None and
            qa.get('issues') == [], 'Runner has no clean terminal result')
    require(qa.get('freezeSha256') == freeze_sha == progress.get('freezeSha256') ==
            status['checkpoint']['freezeSha256'], 'Original freeze changed')
    require(result.get('passed') is True and result.get('startedAt') == START and
            integer(result.get('durationMs'), DURATION), 'Run incomplete or duration invalid')
    start, finish = milliseconds(START), milliseconds(result['at'])
    require(finish - start == result['durationMs'] and finish <= observed_at,
            'Terminal time does not establish the measured full duration')
    require(result.get('completedJourneys') == 288 and
            result.get('smokeEveryMs') == 300_000 and
            result.get('observationEveryMs') == 30_000 and
            integer(result.get('observations'), 2880) and result.get('faucetCalls') == 0,
            'Workload or observer requirements unmet')
    require(integer(result.get('lastSlot'), 1), 'No final slot recorded')
    terminal = progress.get('result', {})
    require(all(terminal.get(key) == result[key] for key in
                ('genesis', 'candidate', 'passed', 'startedAt', 'at', 'durationMs',
                 'completedJourneys')), 'Public reader differs from the full report')
    require(status['soak']['accepted'] is True and status['soak']['state'] == 'passed',
            'Live summary has not accepted this original run')
    require(monitor.get('genesis') == freeze['genesis'] and
            monitor.get('target') == candidate['apiOrigin'] and
            monitor.get('overdue') is False and monitor.get('consecutiveFailures') == 0 and
            monitor['current'].get('healthy') is True and
            -10_000 <= observed_at - milliseconds(monitor['lastProbeAt']) < 90_000 and
            monitor['current']['finalizedSlot'] >= result['lastSlot'],
            'Independent monitor stale, unhealthy or behind terminal slot')
    journeys = result.get('journeys')
    require(isinstance(journeys, list) and len(journeys) == 288,
            'Full journey inventory missing')
    mints, signatures = set(), set()
    delays, durations = [], []
    for index, journey in enumerate(journeys):
        at = milliseconds(journey['at'])
        delay = journey.get('scheduleDelayMs')
        duration = journey.get('durationMs')
        require(integer(delay) and integer(duration, 1) and
                at == start + index * 300_000 + delay and at + duration <= finish and
                delay < 300_000, 'Journey timing does not match the scheduled run')
        for key in ('mint', 'recipient', 'transferSignature'):
            require(isinstance(journey.get(key), str) and
                    re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,88}', journey[key]),
                    'Invalid public journey identifier')
        require(journey['mint'] not in mints and
                journey['transferSignature'] not in signatures, 'Duplicate journey receipt')
        mints.add(journey['mint'])
        signatures.add(journey['transferSignature'])
        delays.append(delay)
        durations.append(duration)
    required = {'load', 'backup-check', 'restart-check', 'pilot-agent-one',
                'pilot-agent-two', 'monitoring-config', 'frontend-rollback',
                'remote-negative-controls'}
    require({p['name'] for p in result['prerequisites']} == required and
            len(result['prerequisites']) == len(required) and
            all(milliseconds(p['at']) < start for p in result['prerequisites']),
            'Original prerequisite inventory changed')
    sorted_durations = sorted(durations)
    return {
        'schemaVersion': 1, 'at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'scope': 'remote original frozen browser soak evidence review; recorded receipts, not independent transaction replay or full release acceptance',
        'passed': True, 'genesis': freeze['genesis'], 'candidate': candidate,
        'runtime': expected, 'freezeSha256': freeze_sha, 'startedAt': START,
        'completedAt': result['at'], 'observedAt': status['fetchedAt'],
        'durationMs': result['durationMs'], 'completedJourneys': 288,
        'observations': result['observations'], 'faucetCalls': 0,
        'uniqueMints': len(mints), 'uniqueTransferSignatures': len(signatures),
        'maxScheduleDelayMs': max(delays),
        'journeyDurationMs': {'minimum': min(durations), 'maximum': max(durations),
                              'p95': sorted_durations[math.ceil(.95 * 288) - 1]},
        'productionNetworkChanged': False, 'cutoverAccepted': False,
        'releaseAccepted': False, 'mainnetAccepted': False, 'bridgeAccepted': False,
        'limitations': ['One validator, bounded valueless browser workload.',
                        'Recorded journey verification is not a fresh replay of pruned transaction history.',
                        'Migration requires a new stopped-writer backup and continuity comparison.',
                        'The source runtime requires its own full stability run.']
    }


def public_file(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(descriptor)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and
                info.st_size <= 1_048_576, 'Not a bounded regular public file')
        with os.fdopen(descriptor, 'rb', closefd=False) as source:
            raw = source.read(1_048_577)
        require(len(raw) == info.st_size, 'Public file changed while reading')
        return raw
    finally:
        os.close(descriptor)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', type=Path, required=True)
    parser.add_argument('--archive', action='store_true')
    args = parser.parse_args()
    require(not args.input_dir.is_symlink(), 'Input directory cannot be linked')
    originals = {name + '.json': public_file(args.input_dir / (name + '.json'))
                 for name in FILES}
    freeze_raw = public_file(ROOT / 'evidence/candidate-freeze.json')
    freeze = json.loads(freeze_raw)
    originals['candidate-freeze.json'] = freeze_raw
    report = review({name: json.loads(originals[name + '.json']) for name in FILES},
                    freeze, hashlib.sha256(freeze_raw).hexdigest())
    require(all(hashlib.sha256(public_file(ROOT / path)).hexdigest() == expected
                for path, expected in freeze['coreFiles'].items()), 'Frozen source changed')
    report['frozenFileCount'] = len(freeze['coreFiles'])
    archive = 'evidence/stability-original-20261014T164823Z'
    report['archive'] = archive
    report['files'] = {name: {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
                       for name, raw in originals.items()}
    if args.archive:
        target = ROOT / archive
        target.mkdir()  # Exclusive: never replace earlier acceptance evidence.
        for name, raw in originals.items():
            with (target / name).open('xb') as output:
                output.write(raw)
        with (target / 'review.json').open('x') as output:
            output.write(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
