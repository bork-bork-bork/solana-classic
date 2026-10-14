# Partial release review for the original frozen candidate

The current individual gate manifest binds candidate `35f0eaf1`, the exact
runtime that completed the original 24-hour browser soak. The prior `c1a7f158`
manifest is retained byte-for-byte in
`evidence/acceptance-gates-c1a7-historical.json`. Its statements are historical,
not approval for the repaired candidate.

## Reviewed stability requirements

| Requirement | Evidence reviewed | Result and scope |
| --- | --- | --- |
| G6.01 workload | `load.json`, recalculated by `load_review.py` | 20 recorded SDK sessions, 100 issuances and 100 transfers over 1,209,398 ms; zero faucet calls; 200 distinct signatures |
| G6.02 confirmations | All 200 operation records | 200/200 recorded confirmations within 15 seconds; failures and missing confirmations zero |
| G6.03 latency | Recalculated nearest-rank distribution | Confirmed p95 3,150 ms; finalized p95 15,167 ms, measured separately |
| G6.04 discovery | All 100 issuance records | Maximum recorded gallery verification 18,152 ms, under 60 seconds |
| G6.06 continuity | Original full soak and checksum-bound prerequisite inventory | 288 browser journeys, 2,880 observations, exact runtime and freeze; prerequisites before the soak and H72 |
| G6.07 deployed identity | Original terminal archive and freeze | Both commits, frontend deployment, configuration, genesis, binaries and runtime boots match |
| G6.11 benchmark scope | Repository disclosure review | Bounded one-validator evidence, with no chain-wide capacity or decentralisation claim |

The experiment finished earlier than the plan's H96 target. The fixed T0 and
H144 deadline are unchanged. The recovery prerequisite is qualified: a current
state reconfirmation of a prior isolated cold restore, not a new archive. Its
historical finality proof and missing old RPC history remain explicit. Migration
still requires a new consistent stopped-writer backup.

The confirmed latency distribution is p50 3,095 ms, p95 3,150 ms, p99 3,328 ms
and maximum 3,364 ms. Maximum operation schedule deviation was 7 ms, within
the frozen runner's one-second tolerance. The previously published workload
summary belongs to the earlier candidate and is not reused for these numbers.

The offline auditor verifies complete indices, unique decoded signatures,
seed inventory, timing, gallery results and aggregates. It rejects forged
statistics, duplicate receipts, missing rows, unsafe timestamps, changed
candidate or boots, and boolean values substituted for numeric metrics.
It reads only named public evidence and never contacts a chain. This verifies
the retained records; it does not independently replay pruned transactions.

## Still unapproved

G6.05 abuse-response evidence needs its own review. G6.08 core repair/new-run
policy and G6.09 later frontend signing/upload/wallet changes need explicit
scope assessment. G6.10 complete machine/workload/failure publication remains
separate. The seven reviewed stability requirements do not approve these four
or any other release gate.

All other requirements are deliberately unattested in the new manifest until
they are reviewed against this candidate. Existing implementation and historical
proofs remain in the repository; an unattested requirement is not a newly
observed product failure. Final browser regression, operator access/handover
and reviewed release remain pending. The later .net frontend and services are
separately tested and do not inherit the original frozen website's soak.

`evidence/release-check.json` reports seven of eleven G6 requirements reviewed,
zero aggregate input errors, and full release **unaccepted**. No validator
switch, fresh backup, new soak activation, monetary launch or bridge activation
occurred. Existing migration admission and production hosting/security gates
remain separate.

```sh
python3 engine/migration/load_review.py
python3 -m unittest discover -s engine/migration -p '*test.py'
python3 scripts/pnpm.py run release:check
```

The release-check command currently exits nonzero because the full individual
review is incomplete. Do not fix that by bulk-refreshing historical checksums
or approving unrelated requirements.
