# Native SOC network development

This directory starts the mainnet work with a read-only genesis planner. It
validates exact native-unit budgets, prelocked original-SOC backing, distinct
declared validator identities, stake/balance allocations and RPC ports. It emits
draft arguments and release blockers. It cannot deploy a network or create keys.

Run `node --test mainnet/plan.test.mjs` with the pinned project Node runtime.
Run `node mainnet/plan.mjs <public-rehearsal-input.json>` to inspect a supplied
rehearsal plan. All amounts are base-unit integer strings. Native SVM accounts
use nine decimals. Origin decimals must match the real original SOC mint.

The intended monetary model has no independent inflation. Bootstrap balances,
stakes and system-account funding must be included in the native budget and
backed before they become spendable. The planner's system-account budget is a
declared envelope, not proof of the actual genesis output: generated genesis
must be reconciled account by account. No faucet or upstream distribution may
silently add spendable supply. Operator labels are not proof of independence.

The current network is a single-node experiment. A future native SOC network
requires real `agave-validator` nodes, a fresh genesis, independently operated
validators, networking, reviewed economic settings, supply reconciliation,
consensus/restart/recovery evidence and an explicit release decision. The
planner deliberately uses Agave's development cluster classification for an
isolated rehearsal; this does not label that rehearsal as mainnet.

The pinned `solana-genesis` build and complete249-account synthetic inventory
already exist. Three full-validator execution remains blocked by the current
host's hard file limit524288, below Agave's required1000000. The next network
step is a capable Linux host and an actual consensus/recovery rehearsal.

The new read-only `host-preflight.py` validates effective host resources and
three exact reviewed runtime artifacts without generating keys, starting a
process or changing limits. See [the operator handoff](VALIDATOR_HANDOFF.md).
This profile is for a private rehearsal; production sizing, independent operators
and funded genesis/reserve custody require their own acceptance.

See [the implementation sequence](../docs/planning/MAINNET_BRIDGE.md). Existing
testnet balances and NFTs have no mainnet conversion rights.

## Backed bootstrap auditor

`bootstrap.mjs` now reconciles a complete genesis inventory with exact declared
original supply/backing, protected reserve rent, precision slack and initial
bridge counters. Thirteen targeted checks and seven planner checks pass.
The retained 249-account genesis projection is in
`evidence/mainnet-bootstrap-accounting.json`.

This is offline accounting with hypothetical original backing, not an on-chain
bootstrap or funded escrow proof. Zero initial counters are flagged; custody,
consumed backing events and actual counter application remain failed gates.
Read [the exact model and remaining implementation](BOOTSTRAP.md).
