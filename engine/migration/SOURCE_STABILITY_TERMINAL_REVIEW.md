# Source-built devnet terminal review

The source-built devnet stability run began at `2026-10-15T03:59:33.330Z`.
Its earliest completion is `2026-10-16T03:59:33.330Z`. The original run cannot
accept it. Elapsed time alone cannot accept it either. This procedure prepares
the final evidence review without changing the runner, validator or candidate.

`source_terminal_review.py` is offline and read-only. It starts no test, contacts
no network, reads no signing keys and writes no archive or release decision.
It prints a scoped report; exit 78 means not accepted. Its exact freeze digest,
start, activation record and original admission inputs remain fixed.

## Inputs after genuine completion

Using existing authorized read-only access, collect a new private directory
containing these bounded JSON snapshots:

- `soak.json`: the complete report from the selected QA namespace's
  `state/evidence/soak.json`, including all 288 journeys. Do not substitute a
  progress count or the old run's terminal report.
- `status.json`: the current branded roadmap status response.
- `runtime.json`: current canonical public runtime metadata.
- `qa.json`: the selected runner's public QA state.
- `progress.json`: the selected read-only progress response.
- `monitor.json`: the independent operator monitor response.
- The eight original admitted proof files: `load.json`, `backup-check.json`,
  `restart-check.json`, `pilot-agent-one.json`, `pilot-agent-two.json`,
  `monitoring-config.json`, `frontend-rollback.json` and
  `remote-negative-controls.json`. Preserve their exact original bytes.

Keep the input directory private until its contents receive publication and
privacy review. Never include a key, raw ledger or arbitrary runtime file.
The public reader intentionally returns a small terminal summary. It does not
expose the complete receipt inventory; collect the full named report through
authorized read-only access. Do not change that reader or the frozen run.

The full report is at the already selected private namespace, not a new test
attempt. Capture fresh public health/status snapshots close together after
collecting it. Status must be within 90 seconds of audit time, with a healthy
fresh monitor at or beyond the final report's slot. Refresh observations if
necessary; do not restart or refreeze the candidate to obtain a pass.

```sh
python3 engine/migration/source_terminal_review.py \
  --input-dir <private-terminal-snapshot-directory> \
  --frozen-context .tools/source-runtime-qa
```

The retained frozen source context must still match all 45 hashes. The current
repository's intentional presentation/developer overlays are separate from
that context and must not be silently substituted or reverted.

## What must pass

The audit binds the exact source freeze and activation. It verifies all eight
prerequisite files against the recorded checksums, their original times and
the terminal runner's input inventory. The original deployed candidate, engine
manifest, binaries and boots must match. The runner must have a clean completed
result, the public reader must match its declared terminal summary, and the
independent monitor must be fresh and healthy.

The full measured duration must cover 24 hours. All 288 scheduled journeys must
exist with unique, correctly sized base58 mint and transfer identifiers. Their
recorded timing must match the frozen five-minute schedule and five-second
maximum delay, with completion before the terminal timestamp. Funding receipt
and payer identifiers are checked separately; a funding signature cannot be
reused as a journey receipt. Required observation counts, zero faucet calls and
finalized progress remain checked.

A successful report is evidence review, not independent transaction replay.
It cannot approve final browser regression, all release gates, mainnet,
production custody or a bridge. Only a reviewed real terminal report can be
used in subsequent release work. Do not bulk-refresh historical attestations.

## Preparation evidence

Seventeen new synthetic terminal tests and sixteen existing terminal/load
regressions pass. They reject incomplete/old runs, substituted runtime or
prerequisites, stale snapshots, missing/duplicate/malformed receipts, wrong
funding and cadence failures. The shared original auditor retains its original
start by default; the source wrapper supplies the separately pinned new start.

An actual read-only snapshot of the running source candidate was refused with
`SOURCE_RUN_NOT_COMPLETED` at 54/288 journeys. There was no terminal report, so
an empty placeholder explicitly represented its absence. This tests refusal,
not completion. See [the scoped preparation record](../../evidence/source-terminal-auditor-preparation.json).
