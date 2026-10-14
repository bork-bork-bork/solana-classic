# Original devnet stability result and next migration step

The original frozen runtime completed its browser stability run at
2026-10-14T16:48:23.028Z (17:48 London). The measured duration was
86,400,266 milliseconds: 24 hours and 266 milliseconds.

The full report contains 288 distinct NFT mint/transfer journeys, 2,880
observer checks and zero public faucet calls. The maximum journey start delay
was 18 milliseconds. Complete journey durations ranged from 27,368 to
32,515 milliseconds, with p95 30,454 milliseconds. These are whole browser
journeys including finality and ownership checks, not transaction confirmation
latency, chain capacity or decentralisation measurements.

The report, public terminal reader, QA exit state, independent monitor, live
runtime observation and original freeze are preserved byte-for-byte in
`evidence/stability-original-20261014T164823Z/`. The full raw report SHA256 is
`cbc8d82b025f69c3ce190fee647c70d8c2d404482304bb4651c1fc2a7da44f6d`.
The review binds each archived file and all 41 frozen source files. No keys,
ledger files, protected inputs or raw runtime logs were exported.

## Reproduce the offline review

```sh
python3 engine/migration/terminal_review.py \
  --input-dir evidence/stability-original-20261014T164823Z
python3 -m unittest discover -s engine/migration -p '*test.py'
python3 engine/migration/preflight.py
```

The first command verifies recorded evidence without contacting a chain. It
does not replay transactions, reconstruct pruned RPC history or independently
prove every health observation. `--archive` creates the original archive
exclusively and must not be repeated against the existing archive. The preflight
also rereads live status and verifies that the original archive still matches.
The added archive check is a local operator guard; the previously reviewed
54-file migration image package remains unchanged.

## What is ready

The original soak, source build, mixed-binary rollback rehearsal, prepared
package and image checks pass. Read-only preflight permits entry into
maintenance. It does not permit opening the source runtime to users.

The next founder decision is the devnet maintenance window for the exact
source-build migration described in `docs/AGAVE_MIGRATION.md`. Until that
decision, the official validator, ledger, genesis and runtime boots remain
unchanged. No maintenance window has been started or implied by the timer.

After the decision, take a new consistent stopped-writer backup, capture the
quiescent account/database/artwork baseline, start the reviewed candidate with
writes held, and compare that baseline before enabling writes. Preserve the
deployed developer programmes as well as the studio's assets. Roll back using
the existing reviewed official image if those checks fail. The new runtime
requires its own full 24-hour stability run within the original fixed sprint
deadline, 2026-10-19T03:00:54Z.

## Separate release checklist

The current offline release aggregate remains unaccepted. Its individual gate
manifest still references the earlier `c1a7f158` candidate and older checksums;
many requirements have not been individually attested. The dated review is
`evidence/devnet-release-gap-review-20261014.json`. This is an evidence-review
backlog, not a declaration that the working features have failed. Do not repair
it by replacing all checksums or marking all gates passed automatically.

Review each requirement against the repaired frozen candidate and applicable
bounded proof. A final clean-browser regression, complete operator handover
and explicit release decision remain separate from this completed soak.
Migration backup/continuity are maintenance-time requirements. Mainnet hosts,
independent operators, actual monetary backing, bridge custody and external
security review remain separate production gates.
