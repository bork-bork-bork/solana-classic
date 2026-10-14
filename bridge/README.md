# SOC redemption bridge prototype

Actual SVM escrow/native-reserve program source is in `program/`. Client event
decoding, unsigned claim construction and a local read-only observer are in
`sdk.mjs`. This is an isolated development prototype, not a deployed bridge.

The program starts paused. Its origin side locks immutable Token-2022 units;
the Classic side transfers existing native reserve units. Returning native
units creates a return event that permits escrow redemption after a configured
3-of-5 quorum attests it. It does not mint wrapped SPL SOC on Classic.

Read [the trust model, sequence and production blockers](../docs/planning/MAINNET_BRIDGE.md).
The committee and upgrade authority are material trust assumptions. No audits,
operators, live token addresses or production programme deployments are claimed.

## Local verification

From the repository root, use the project Node runtime and the installed Rust
and SBF compiler. Dependencies are pinned by `program/Cargo.lock`. Test data is
synthetic; generated compiler keys and binaries stay under ignored `.tools/`.

```sh
node --test mainnet/plan.test.mjs bridge/sdk.test.mjs bridge/observer-recovery.test.mjs
CARGO_TARGET_DIR=.tools/bridge-target cargo test --manifest-path bridge/program/Cargo.toml --locked --lib
python3 scripts/install-token-program.py
CARGO_TARGET_DIR="$PWD/.tools/bridge-sbf-target" cargo-build-sbf --manifest-path bridge/program/Cargo.toml --sbf-out-dir .tools/bridge-bootstrap-artifacts -- --locked
CARGO_TARGET_DIR=.tools/bridge-target cargo test --manifest-path bridge/program/Cargo.toml --locked --test runtime
```

Runtime tests execute the compiled bridge SBF in local LiteSVM, with the
checksum-pinned official Token-2022 v10 binary. This covers CPI token movement,
native reserve debits/returns, replay PDAs, quorum, initial pause, initialization
authority, insufficient reserves and rollback. It is not a two-Agave-network
test, real source-chain finality or an independent security review.

No code here calls a public RPC, deploys a programme, imports a wallet or sends
real assets. The read-only observer is limited to loopback rehearsal endpoints.
Production mint/bridge initialization and upgrades need a separately reviewed
design and release tooling.

## Observer recovery checkpoint

The local read-only observer accepts `minimumContextSlot` from a retained,
same-genesis observation. It requests finalized state with `minContextSlot`,
rejects a response below that checkpoint, and rechecks genesis after reading
the event. An outage, missing event, changed owner/domain, RPC error or chain
replacement yields no observation; it never returns cached settlement approval.

Thirteen SDK/recovery checks pass, including six real loopback HTTP transport
failure scenarios with synthetic RPC responses. They cover client admission
and recovery, not Agave consensus or an actual network fork. A dishonest RPC
can still lie about finalized state. Independent source verification, actual
private-ledger restart/fork drills and production custody remain open. Preserve
the older two-chain proof's source hashes: that proof ran the previous observer.

The updated observer subsequently passed seven real private-ledger recovery
checks, including each RPC outage, matching finalized state after SIGINT
restart, and compiled-bridge replay rejection. No new transactions were
broadcast; this is not a pending-settlement, fork or cold-restore result. See
[recovery evidence](../evidence/bridge-ledger-recovery.json) and the
[finality/recovery policy draft](FINALITY_RECOVERY.md).

## Pending native release

The [private pending-claim journal](PENDING_CLAIMS.md) now persists exact signed
bytes before one submission handoff and reconciles the same finalized
signature, receipt and native balance movement. Fifteen unit checks and six
actual private-ledger checks pass, including a real destination RPC outage and
restart with one claim broadcast. The fault harness waited for finality while
the client stayed unconfirmed; this does not test unknown landing or a fork.
That checkpoint covered native release; production signer custody and further
crash/finality work remain open. Original redemption is covered below. See `evidence/bridge-pending-recovery.json`.

## Original-token pending redemption

The shared journal now covers both directions. Twenty-three journal checks
pass, and a separate six-check actual redemption drill recovered one original
token transfer after origin RPC outage/restart. Mint/recipient authority and
exact token debits/credits are checked; hidden native movement is rejected.
Both counters and escrow reconcile at 600,000 synthetic origin units. The
prototype accepts only plain immutable Token-2022 mints and a canonical ATA.
Unknown landing, extended mint handling and production security remain open.
See `evidence/bridge-redemption-recovery.json`.

## Guarded bootstrap and protected reserve

The [V2 bootstrap prototype](BOOTSTRAP.md) records initial backing once without
moving native funds, consumes the normal replay receipt, sets the native
counter and protects reserve rent plus extra backing from later claims. Ten
Rust unit tests, nine compiled-SBF scenarios and five unsigned-client checks
pass locally. The 16-byte vault rejects the previous eight-byte ABI; prior
private ledger artifacts are preserved. Actual backed genesis, remote finality,
custody, fresh Agave integration and production release remain unverified.
