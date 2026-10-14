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
node --test mainnet/plan.test.mjs bridge/sdk.test.mjs
CARGO_TARGET_DIR=.tools/bridge-target cargo test --manifest-path bridge/program/Cargo.toml --locked --lib
python3 scripts/install-token-program.py
CARGO_TARGET_DIR="$PWD/.tools/bridge-sbf-target" cargo-build-sbf --manifest-path bridge/program/Cargo.toml --sbf-out-dir .tools/bridge-artifacts -- --locked
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
