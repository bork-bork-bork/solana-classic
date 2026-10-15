# Isolated development-network recovery

This package is prepared for review. It has not copied a remote archive or
started a remote validator. A passing unit test does not certify recovery.

The existing migration archive is a consistent stopped-writer backup. The
canonical migration reopened the original volume. It did not restore an
isolated copy, so migration continuity cannot substitute for cold recovery.

## Exact worker constraints

Run only on project `356bcb0b-49c4-4bd3-bf10-bff7db8f33fe`, environment
`3367b373-2332-4702-8cce-c12b8f03949e`, separate source-build worker
`29189101-226c-483b-a424-b8cd140abd80`, volume
`285d8475-de1c-4af5-8705-65e03385a719` mounted at `/data`.
Independently verify that volume assignment before staging the private review.
The process environment alone does not always expose the volume UUID.

Require Linux, Node 24.19.0, existing locked worker dependencies and the exact
source-built Agave 3.0.14 executable at `/data/target/release/solana-test-validator`.
Its SHA256 is `3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a`.
Do not patch open-file limits or pass a bypass flag. No other validator may run
on this worker during the drill; serialize existing rehearsal jobs. Require at
least 12 GiB free after uploading inputs. Inspect actual memory and file limits
before review; the archive has 2163 accounts and this is a bounded single-node
recovery, not a full-validator consensus benchmark.

RPC 25899, WebSocket 25900, faucet 25901, reserved API 25910, gossip 26000 and
dynamic 26001 through 26060 must be free on loopback. No public ingress, keys,
operator bootstrap, canonical process control or monetary actions are exposed.
The source-build worker's existing HTTP service on 3000 stays intact.

## Review and staging

1. Review `launcher.py`, `verifier.mjs` and their tests before any remote copy or
   process start. Pin the exact driver hashes in an owner-only `worker-review.json`.
2. Choose a new canonical UUID. Create private input directory
   `/data/classic-recovery-inputs/<UUID>` with 0700 permissions. Retain every prior
   directory, archive and failed attempt. The launcher exclusively creates its
   own `/data/classic-recovery/<UUID>`; a repeated attempt is refused.
3. Privately stage the retained 1,055,669,530-byte `backup.tar.gz`, both unchanged
   archive-time manifests `official-inventory.json` and `app-baseline.json`, and
   the exact final `candidate-freeze.json`. Do not use the later restart canary.
   All input records and the archive must be 0600 and owner-controlled.
4. Stage the exact derived runtime under `runtime/`. All45 frozen source files
   and their ancestor paths must be ordinary files/directories. Reuse only
   explicit links to the worker's existing `/app` dependency directories:
   `node_modules`, `apps/api/node_modules`, `packages/chain/node_modules`, and
   `packages/config/node_modules`. The worker lockfile and executed shared
   package sources must match the freeze. No package installation is performed.
5. Stage the two reviewed drivers. The private review must contain
   `approved:true`, `attempt:<UUID>`, actual `workerServiceId`, `workerVolumeId`,
   and `driverFiles` mapping each driver filename to its exact SHA256. Approval
   here means the actual recorded technical review, never an invented placeholder.
6. Only after that review, execute on the designated worker:

   ```sh
   python3 launcher.py --attempt <UUID> --ack isolated-devnet-recovery
   ```

The launcher verifies compressed and decompressed archive digests/lengths,
rejects traversal, duplicate members, special files and escaping links, then
extracts ledger/application/config into a fresh private directory. Operator
bootstrap files are not extracted. Existing private key files inside the copied
ledger remain private and are never read or exported by this package.

Before boot, all application tables and 1992 immutable files must match the
archive-time manifest, including all 617 gallery records. The loopback validator
uses only the new copied ledger, checks original genesis and advancing finality,
and is stopped after the bounded verification. There is no reset or source
binary modification. Timeout/failure leaves the copy, reports and logs retained.

All 2163 archived account addresses are checked with lossless Python integers.
User/programme bytes, owners, balances, execution and rent fields must match.
Only five named time/vote data accounts and a bounded existing validator fee
balance may advance. This does not enumerate every current positive account or
reconcile each new vote fee; those limits are explicit in the proof.

The unchanged source API factory verifies runtime/software identity, health,
all 617 paginated gallery rows, each mint's supply/metadata/authorities, NFT
ownership and every gallery asset's original URI and restored bytes. The bound
is10,000 rows and the exact archive count must be reached; nothing is truncated.
The entire archived immutable-file manifest is also compared before/after.

A real archived confirmed 1 TEST faucet receipt is selected by its actual archive
balance. The unchanged persistence method must return the same UUID/signature
without reserving another grant. Balance and receipt finality are checked.
The exact HTTP mutation route remains held and must reject the request. No
migration controls are manufactured. If old transaction history is unavailable,
record failure instead of selecting or creating a replacement receipt.

## Acceptance limits and the remaining full drill

This package produces bounded operational recovery proof with
`backupCheckAccepted:false`. It does not satisfy the stock `backup-check.ts`,
which additionally requires a distinct actual Railway public API/service/volume
and an exact HTTP faucet replay through the restored gateway. The held source
API's fixed `/data/migration` release controls cannot be repointed or bypassed
inside the shared worker namespace.

For that full proof, prepare a separate isolated service with its own fresh
`/data` namespace/volume, actual provider IDs and authenticated private archive
transfer. Use a separately reviewed startup wrapper that admits only that
isolated service, the copied archive and pinned source executables/API files;
never impersonate the canonical service or weaken `engine/migration/start.mjs`.
First collect full restored bank/application/asset/canary continuity while
writes are held. Reconcile exact protocol fee changes as required. Only then
review a recovery-scoped release in that isolated namespace using the genuine
continuity proof and existing hold contract. It must not release canonical
writes or activate any public token/bridge.

Run the same archived UUID through its real isolated HTTP gateway, verify the
original finalized signature and unchanged balance, and prove complete gallery,
NFT ownership, immutable assets and advancing finality. Record provider source
and target identities, backup/restore times, immutable proof hashes and exact
baseline binding. Preserve canonical runtime boots/source/freeze throughout.
After review, produce an honest candidate-bound `backup-check` report from the
actual full drill. Do not turn this bounded package's false acceptance field
into a pass or copy the old candidate's result.

## Local guard checks

```sh
python3 -m unittest engine/migration/recovery/launcher_test.py
node --test engine/migration/recovery/verifier.test.mjs
```

These checks exercise wrong-service/mode admission, exclusive attempts, private
permissions, unsafe archive links, expansion bounds, full application changes,
lossless account comparisons, finite pagination and same-receipt replay. They
never copy a remote archive or start a validator.
