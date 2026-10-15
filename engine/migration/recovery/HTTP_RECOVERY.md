# Existing isolated service: full HTTP recovery

Restore attempts run only on the isolated target below. Local checks validate
admission and accounting logic; they do not prove a successful restore. This route uses the
existing recovery-drill service and its own volume, with a new private copy.
No new service, purchase, canonical restart or frozen source edit is required.

## Target and preserved state

- Service: `43fc867b-1105-423c-a901-84ec5cb9a46a`.
- Volume: `b3030354-8a36-4fed-939e-ea957fd65001`, mounted at `/data`.
- Ingress: `https://recovery-drill-production.up.railway.app`, port3000.
- Existing allocation:4CPU/16GiB and50GB volume. Recheck actual free space;
  startup requires12GiB after uploading the private archive and runtime files.
- Old root `/data/ledger`, `/data/app`, archives and receipts remain untouched.
- New attempt: a fresh UUID for every real extraction and boot.
- Private inputs: `/data/classic-recovery-inputs/<attempt>`.
- New restored state: `/data/classic-recovery/<attempt>/restored`.

The provider must stop the old isolated process before the reviewed replacement
entrypoint starts. The startup guard refuses active validators or occupied
ports; it never kills or replaces an existing process itself. Archive extraction
is exclusive and rejects traversal, unsafe links and overwrites. Validated
snapshot account links are rebased to absolute paths within the new copy because
Agave compares their recorded targets with its absolute account run paths. Failures remain
retained. The canonical service and shared source-build worker are forbidden.

## Stage and review before deploying the target

Use the retained1,055,669,530-byte gzip archive and exact raw/compressed hashes
pinned in `launcher.py`. Stage exact final `candidate-freeze.json`, archive-time
`official-inventory.json`, and `app-baseline.json` as owner-only inputs. Preserve
the later restart baseline separately; it is not present in this backup.

`http_baseline.py` derives the complete617-row HTTP comparison and original
confirmed1TEST receipt only if the full database and1992-file manifest match.
A real baseline is already prepared privately, SHA256:
`15e902f2074909127ff09b48fb2949733f0aa33d994acad5e98ae6df9aceb924`.
Stage those unchanged bytes as `archive-http-baseline.json`.

Stage all45 frozen runtime files under `runtime/`, including the unchanged
37-file runtime manifest. Stage all four source-built public executables under
`runtime/.tools/agave-linux-v3.0.14/solana-release/bin`. Their actual size, SHA256
and startup version must match the freeze. Existing target `/app` dependencies
may be reused only through the four explicit links admitted by `http_start.py`;
the worker lockfile and executed shared package source must match. No package
installation or source compilation is performed by this entrypoint.

Review and stage `http_start.py`, `launcher.py`, `http_runtime.mjs` and
`http_contract.mjs`. The private `http-target-review.json` must contain:

- `schemaVersion:1`, `scope:isolated-source-http-recovery-target`, `approved:true`,
  `providerAssignmentVerified:true`, the actual `reviewedAt` and `attempt`.
- `target`: actual project/environment/service/volume IDs and exact ingress.
- `freezeSha256`, `archiveSha256`, `rawArchiveSha256` and
  `archiveHttpBaselineSha256`: exact reviewed input fingerprints.
- `driverFiles`: actual SHA256 of each of the four executed drivers.

These are records of an actual review, not placeholders to make a gate pass.
Preserve the old target's deployment/configuration for rollback. Only the
isolated target's old `SC_OPERATION`, `SC_MIGRATION_MODE` and `SC_QA_PREFUND`
settings must be explicitly cleared when approving this new entrypoint. Those
modes belong to the previous startup. The new code never invokes or weakens the
canonical `engine/migration/start.mjs`.

The reviewed target start command is:

```sh
python3 <private-inputs>/http_start.py <attempt> <actual-review-SHA256> --ack isolated-source-http-recovery
```

It restores and boots only the new copied ledger, using RPC25899, WebSocket25900,
faucet25901, gossip26000 and dynamic26001 through26060. RPC is loopback-bound.
Upstream Agave binds its faucet on an unspecified address; supported zero
per-request/time caps refuse positive new grants. Do not describe that faucet
listener as loopback-only. Only the API's3000 ingress is exposed by the provider.

The unchanged API factory receives fixed remote settings scoped to the new
copied application directory. It reports the actual isolated deployment and
fresh process boot IDs. The original source settings, hold and runtime files
are unchanged. An additional guard admits reads and only one exact archived
faucet UUID; all other mutations and transaction/control RPC methods are denied.
The original migration hold still keeps that one POST unavailable initially.

## Actual held bank inspection

Use `snapshot_export.py <attempt> <new-export-UUID>` only after held readiness.
It privately copies the earliest NEW full snapshot whose slot is finalized and
at most10,000 slots after archive bank348492. It also copies genesis.bin and the
complete finalized `getBlocks`/full `getBlock` vote interval. All snapshot bytes,
hashes, slot bounds, current runtime and separate target IDs are recorded. No
operator or ledger key files are exported.

Transfer that small snapshot bundle privately for native Agave3.0.14
`agave-ledger-tool accounts` inspection in a new retained directory. The existing
native tool already proved complete inventories for the migration. Its SHA and
actual commands/results must be recorded again. Linux's hard file ceiling may
still block ledger-tool; never bypass it or assume a rebuilt tool fixes the host.

Normalize the actual complete emitted account list with the existing strict
inventory validator. Compare all2163 positive accounts with the archive-time
inventory. Only named consensus/time data may advance. Use `vote_fees.reconcile`
against EVERY finalized block from348492 through the inspected snapshot slot;
require vote-only instructions, original fee payer, exact fee/reward totals and
an exactly matching validator identity balance delta. Missing blocks, unexpected
transactions/rewards, partial inventory or unexplained balances are failures.
A read of2163 known addresses is not complete bank enumeration.

Keep private snapshot/bank/block inputs and attempts. Export only bounded
inspection/account/fee summaries with genuine source proof hashes.

## Release only this isolated archived replay

Stage `held-http-continuity.json` and actual referenced owner-only JSON proofs in
the private input directory. Its scope must be
`isolated-source-http-recovery-held-continuity`; it binds the original archive,
new source freeze, actual separate target service/volume/deployment and current
API/validator boots. `completeAccountComparison` must record a genuine complete
current inventory,2163 accounts, unchanged user/programme state and exact vote
fee reconciliation. Application proof must record all617 rows and1992 immutable
files, archived canary verification, safe extraction and unchanged canonical
runtime. The contract also checks the referenced proof hashes.

After reviewing those actual results, stage `approve-http-replay.json` with
`action:release-isolated-recovery-replay`, exact held-proof SHA256, actual target
service/volume, genesis and a later `approvedAt`. The wrapper then creates fresh,
owner-only source-compatible release controls solely in THIS isolated volume's
`/data/migration/<source-migration-ID>`. It rejects pre-existing controls and
writes no canonical files. The existing `hold.mjs` must accept the genuine
proof; the outer guard still denies every mutation except the one archived UUID.

## Actual public verification and acceptance

From the repository's pinned Node/toolchain, execute the reviewed HTTP verifier:

```sh
node --import tsx engine/migration/recovery/http_verify.mjs <reviewed-baseline-file> <baseline-SHA256> <new-private-proof-file>
```

It anonymously verifies actual separate HTTPS identity, source runtime,
advancing finality, all617 paginated rows, mint supply/authorities/metadata, NFT
owners, and original/restored immutable asset bytes. It checks the archived
receipt's finalized signature BEFORE making the one actual HTTP faucet POST,
then requires the original UUID/signature/amount and unchanged balance. No
new wallet, grant, signed transaction or retry is created. Read pacing respects
the original gateway limits. Failures remain explicit and retained.

Even a passing HTTP report keeps `backupCheckAccepted:false`: the operator must
review it with the actual full-bank/fee/app/extraction/provider proof bundle and
unchanged canonical freeze. Only then create the candidate-bound aggregate
`backup-check` record for the new24h prerequisites. Stop only the isolated target
through the reviewed provider operation afterward; preserve its old and new
volumes/directories. Elapsed time, copied booleans or old-candidate reports do not
accept recovery, the soak, a public token or monetary mainnet.
