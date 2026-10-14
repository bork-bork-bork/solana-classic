# Source-built Agave: migration and rollback

This is a prepared testnet operation. No current writer, ledger, genesis, API,
QA runner or frozen frontend was changed during preparation. The source runtime
is the same reviewed Agave v3.0.14 commit, compiled in this repository. It still
uses `solana-test-validator`; this does not create a multi-validator mainnet.

## Exact deployment inventory

| Item | Reviewed identity |
| --- | --- |
| Railway project | `356bcb0b-49c4-4bd3-bf10-bff7db8f33fe` |
| Environment | `3367b373-2332-4702-8cce-c12b8f03949e` |
| Canonical service | `d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6` |
| Existing volume, unchanged mount | `080bf785-50e7-4dda-893b-4d613aa5e9a8`, `/data` |
| Existing genesis | `7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon` |
| Official rollback deployment | `04c379cd-369c-4ff4-9d14-d29467d68a28` |
| Source-build run | `40de48b7-6963-429b-ae3e-81a610d81b7d` |
| Upstream commit | `f516a8927c76c07f0ebc54ca7a4ce8b2046eee86` |
| Prepared package source commit | `119f25e`; full hash is in the package proof |
| Migration ID | `ae834e71-fb59-4beb-b26b-4485be3a386f` |
| Candidate core digest | `533950731d4ed6d94b59e71517613be002b6ec416b0ebb3a20a592fe5ec6f22f` |
| Image-probe service | `226510f3-1b2c-4ff9-b598-095c43d0e33b` |
| Verified probe deployment | `745f6733-1538-4f5b-a4bc-d4ec82798a87` |
| Verified image digest | `sha256:19595c406b6effe8bc5a3fdb618822755f46866e4e6ebfb1c6371513e51d2e32` |
| Source test-validator SHA-256 | `3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a` |
| Official test-validator SHA-256 | `80f3bc0e3fa6a3090e69bafbfe00b249eaa655c5874ac83aebb6acdb157140ab` |

The reviewed local upload context is `.tools/source-runtime-candidate`. Its 54
named files and four public executables are checksum-bound in
`evidence/source-runtime-candidate-package.json`. It contains no runtime data or
keys. Preserve this exact context; regenerating it creates a different migration
ID and requires new image verification. Preparation/export scripts live in
`engine/migration`. The imported engine tree remains unmodified.

## Evidence already completed

- The source-build run compiled four binaries, passed 71 program-runtime and 92
  SVM tests, and verified transfers, restart and independent cold recovery.
- The mixed-binary rehearsal started a fresh private ledger with the official
  binary, switched to the source binary, created additional assets, rolled back
  to official, switched forward again, and cold-restored with both binaries.
  Balances and token/NFT state from before and after the switch survived.
  See `evidence/agave-migration-rollback-rehearsal.json`.
- The actual slim Debian/Node image executed all four binaries and checked exact
  hashes and version strings. It has no volume or public domain and has not
  started a validator. See `evidence/source-runtime-image-probe.json`.
- The actual image's API rejected faucet, asset creation, gallery publication
  and signed-transaction submission with `503 MIGRATION_READ_ONLY`, while its
  checked `/api/runtime` remained inspectable. See
  `evidence/source-runtime-api-hold-probe.json`.

These checks establish preparation and bounded staging compatibility. They do
not certify a migration of the canonical dataset or the next stability run.

## Go/no-go before entering maintenance

Run `python3 engine/migration/preflight.py`. This command only reads fixed public
status and local public proof files. Its nonzero exit blocks entry while the
original run is incomplete, stale, changed or failed. `--prepare` records progress
without approving maintenance. Check the actual terminal soak result, not just
the clock: exact original freeze/candidate/boots, 288 journeys, full duration,
matching start `2026-10-13T16:48:22.762Z`, no failures. Preserve the terminal
report and the original freeze under dated filenames before changing anything.
Earliest original completion is 14 October 2026 at 17:48 London.

Also inspect the independent monitor, current main deployment/image identity,
provider settings and volume free space. The preparation observation found
approximately 41 GB free, with approximately 3.1 GB of ledger files. Recheck
at maintenance time; this measurement is not a reservation. Keep one replica,
zero deployment overlap and at least 30 seconds of provider drain time. Do not
change these settings during the original run.

## Execute after the completed run is reviewed

1. Announce the brief testnet maintenance window on the site/roadmap. Preserve
   original acceptance evidence. Record current runtime, finalized slot, known
   balances, mint bytes/authorities, NFT owners, immutable metadata/image hashes
   and URLs, original gallery/faucet receipts, uploaded-asset references and the
   image service identity. This preliminary observation is not yet a quiescent
   baseline because users may still submit transactions.
2. Enter the existing official image's stopped-writer backup mode. Stage only
   `SC_OPERATION=cold-backup`, `SC_OP_ACK=experimental-cold-recovery` with
   `railway variable set --skip-deploys`, always selecting the exact project,
   environment and canonical service. Preserve any existing
   `/data/backups/current.tar` by a checked rename to a new private dated path;
   never overwrite or delete earlier backups. Redeploy the exact official
   deployment using `deploymentRedeploy(...,usePreviousImageTag:true)`. Verify
   the old API/validator are stopped before the fresh backup begins. The fresh
   maintenance container starts neither writer. Its `/healthz` only means the
   backup process finished, not that the chain is online.
3. Require a completed fresh `/data/backups/receipt.json`, exact archive length
   and SHA-256, matching canonical genesis, archive inspection, and sufficient
   remaining free space. Keep the entire archive private: it contains protected
   TEST operator material. Retain it separately under
   `/data/backups/migration-ae834e71-fb59-4beb-b26b-4485be3a386f/`; copy/rename only
   after the backup is complete. The October 13 archive is an older checkpoint
   and must never stand in for this fresh backup.
4. While the public API remains in maintenance, use the official binary locally
   on the existing ledger to capture the quiescent state baseline through
   loopback RPC. It must be the only validator writer. Read logical SQLite
   `assets`, `gallery`, and `faucet` rows, and hash the immutable files. Inspect
   wallet balances and mint/authority/NFT state for the recorded canaries and
   registry mints. No faucet request, issuance or transfer belongs in this
   read-only baseline phase. Stop the local official validator cleanly before
   deploying the candidate. Ordinary validator votes during inspection may
   advance slots; they are not new user transactions. Do not export its keys.
5. Stage `SC_OPERATION=`, `SC_OP_ACK=`, `SC_QA_PREFUND=`, and
   `SC_MIGRATION_MODE=canonical-testnet` with `--skip-deploys`; preserve all
   existing origins and data/RPC settings. Select root `Dockerfile` for the next
   upload. Upload the exact prepared context with `railway up --detach
   --path-as-root ... .tools/source-runtime-candidate`, using the canonical
   service selectors. Do not initialize another volume, change genesis, replace
   bootstrap files, change Token-2022 or expose raw RPC/faucet ports.
6. The candidate verifies its four executable hashes, requires the existing
   ledger/config/operator/database, checks saved genesis and starts the managed
   private Explorer reader on port 3002. API writes remain held. Record the
   observed new deployment/image digest, API and validator boots, source/core
   identity and `engineBuild` manifest from `/api/runtime`. Compare actual image
   and package provenance against the probe. A different image digest requires
   an explicit review of its build/runtime evidence; do not silently substitute
   another image. Require advancing finalized slots, unchanged canonical
   genesis, checked Token-2022 bytes, baseline balances/mints/owners, logical DB
   rows, immutable files/URLs, original faucet UUID/signature and working
   Explorer block/address reads. Expect `/api/status` to return maintenance 503
   while the gate is held. The original successful soak is now historical.
7. Only after those real comparisons pass, write private regular `0600` control
   files in `/data/migration/ae834e71-fb59-4beb-b26b-4485be3a386f/`.
   `continuity-pass.json` must contain `passed:true`, the migration/build IDs,
   canonical genesis, source `validatorSha256`, actual `backupArchiveSha256`
   and actual verification timestamp `at`. Retain the complete comparison proof
   separately. `enable-writes.json` contains
   `action:"enable-source-testnet-writes"`, matching IDs/genesis,
   `proofSha256` of the exact continuity file and an `approvedAt` after that
   verification. Missing, malformed, linked, permissively readable or mismatched
   files leave writes held. These files are never included in source/image
   uploads or a public HTTP control route.
8. Verify writes open, run bounded real native/meme/NFT/browser/upload/Explorer
   regression and reconfirm monitoring. Regenerate the actual candidate freeze
   and current load/recovery/pilot prerequisites. The QA context must contain
   the exact generated API overlays/runtime manifest, not the old repository
   API files; `config/runtime-build.json` binds the overlays and managed reader.
   The existing official frontend can retain its original frontend commit;
   the new API source/core/boots and deployed source-build provenance are new.
   Archive the completed old QA attempt and outputs, then explicitly activate
   a fresh full 24-hour run. Never reuse its passed result for the new runtime.

There is no unattended auto-switch or automatic soak restart. The original
deadline remains 19 October 2026, 04:00 London.

## Rollback

Trigger rollback if the candidate cannot start, genesis/provenance differs,
finalized slots stall, state comparisons fail, or a required browser flow
regresses. Keep writes held; if already enabled, archive `enable-writes.json`
under a checked new name to close the gate. Preserve logs, the failed runtime
identity and any post-switch signed receipts. Do not delete the ledger.

Clear operation/prefund variables with deferred deploys. Redeploy the exact
official rollback image `04c379cd-369c-4ff4-9d14-d29467d68a28` using the provider's
previous-image operation on the same canonical service and volume. Verify no
overlapping validator process and repeat the current-state comparisons. The
rehearsal proved that the official binary can read transactions created by this
source build; the live ledger still requires its own checks.

The old image does not contain the supervised Explorer reader. Reinstall the
exact reviewed adapter using `infra/explorer/README.md` after old-validator
readiness, or its chain/address feed will be unavailable. Record the rollback
API/validator boots and mark any new soak interrupted. Do not reuse the original
run's acceptance merely because the old software returned.

If the old binary also fails on the current dataset, remain in maintenance.
Preserve the current volume and failed data. Diagnose/restore the private cold
archive into a separately approved isolated recovery target and verify it
before any route/volume change. Never overwrite the live ledger with an older
archive: that can erase already finalized user activity.
