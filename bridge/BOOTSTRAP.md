# Native reserve bootstrap prototype

The new isolated bridge build can record initial native backing without
releasing it twice. It starts with a zero counter, then accepts one paused
bootstrap instruction from its current upgrade authority and three distinct
configured committee signers. The authority must be separate from those
committee members. This is committee-attested accounting, not a source-chain
proof, complete genesis proof or production release.

## What the program enforces

An incoming origin lock must target the native vault and bind the bridge,
source/destination identities, programs, source-event PDA, amount and epoch.
The witness carries a complete-inventory digest and exact integer supply,
total native units, units outside the reserve and reserve units.

For conversion factor `F`, supply `S`, total `G`, outside allocation `A`, reserve
`R` and locked original amount `L`, the program checks:

```text
G = S × F
A + R = G
actual native vault balance = R
protected floor = L × F - A >= actual vault rent
```

Bootstrap leaves the native vault balance unchanged. It sets native outstanding
to `L`, stores an immutable audit record, and consumes the **same claim PDA**
used by ordinary settlement. The original counter was already increased by
the source lock; bootstrap does not edit or recreate that remote counter.
Changing the recipient cannot reuse the consumed source event. A second
bootstrap cannot allocate the bootstrap record again. Failed attempts roll
back receipt, record, floor and counter writes atomically.

All later native releases must leave the protected floor, including precision
slack and extra backing. Native returns and original escrow redemption continue
to use the existing exact-unit paths. The floor has no administrator withdrawal
or reset instruction, although the upgrade authority remains a material trust
assumption.

## ABI and artifact boundary

The vault is now **16 bytes**, magic `SCVLT002`, followed by its protected native
floor as little-endian u64. The config stays 382 bytes; events stay 297 bytes.
Existing instruction opcodes 0–3 remain; bootstrap is opcode 4, 362 bytes.
The immutable bootstrap PDA has 120 bytes, magic `SCBST001`.

This is a fresh prototype ABI. It **rejects old eight-byte `SCVLT001` vaults**;
there is no migration instruction or automatic upgrade of retained rehearsals.
Keep the original binary and private ledgers. Build new code separately:

```sh
CARGO_TARGET_DIR="$PWD/.tools/bridge-sbf-target" cargo-build-sbf --manifest-path bridge/program/Cargo.toml --sbf-out-dir .tools/bridge-bootstrap-artifacts --offline --skip-tools-install -- --locked
CARGO_TARGET_DIR=.tools/bridge-target cargo test --manifest-path bridge/program/Cargo.toml --locked --offline --lib --test runtime
node --test bridge/bootstrap.test.mjs mainnet/bootstrap.test.mjs
```

The runtime tests load the separate bootstrap artifact. They execute compiled
SBF and actual Token-2022 CPI in two local in-process SVMs. Ten Rust unit tests,
nine runtime scenarios and five unsigned-client checks pass. Synthetic balances
and the attested budget are injected fixtures; they are not a full inventory
of those VMs or a new two-Agave-ledger/mainnet test. A legacy transaction with
four ephemeral test signatures fits the 1,232-byte limit.

## Preparation sequence for a future isolated ledger rehearsal

1. Use fresh private origin and native identities and a new reviewed attempt
   directory. Pin binary hashes and authorities. Preserve prior attempt roots.
2. Initialize the native config paused. Arrange the reviewed V2 vault custody
   transition; every balance used to initialize or fund it must be reconciled.
3. Use one aggregate origin lock addressed to that native vault. This prototype
   accepts one backing event, subject to the configured per-transfer limit;
   multiple-event bootstrap is separate work. Origin locking needs its own
   reviewed admission; native settlement stays paused.
4. Independently verify the finalized source lock, immutable mint/precision,
   source configuration, code/authority pins, escrow balance and source counter.
   The program cannot perform those remote reads.
5. Reconcile the complete native activation inventory to genesis and original
   supply, including setup rent, fees, validator/stake balances and custody
   transfers. The earlier retained system-account reserve is not this vault.
6. Pass the complete accounting input to `bootstrapInstruction` in
   `bridge/bootstrap.mjs`: isolated mode, actual destination genesis/vault,
   `reserveDataBytes: 16`, exact backing and both declared counters. This helper
   reruns the offline inventory auditor and returns an unsigned instruction.
   It refuses public and canonical devnet identities, signs nothing and makes
   no RPC calls. It does not verify remote escrow or upgrade authority itself.
7. Only after that separate rehearsal review, sign with the pinned authority
   and three committee members. The program checks current authority, quorum,
   fresh paused state, event domain, actual reserve, arithmetic and rent floor.
8. Verify finalized record, consumed claim receipt, both counters, unchanged
   reserve balance and the enforced floor. Decode records with
   `decodeBootstrapRecord`. Opening ordinary settlement requires its own review.

No signer service, broadcast runner or monetary activation is supplied here.
The committee can attest false supply, inventory or source finality; its digest
does not make those facts independently true. Unbootstrapped isolated reserve
tests still exist, so a production release must explicitly require the verified
bootstrap record. Full-validator consensus, actual funded escrow, custody,
independent verifiers, code/upgrade controls and external security review remain
open. See [sanitized local evidence](../evidence/bridge-bootstrap-local.json).

## Fresh Agave execution evidence

Fourteen checks now pass on two new private source-built Agave3.0.14 ledgers.
Deployed V2 bytes/authority, immutable source lock, bootstrap without payout,
receipt/counter initialization, replay/quorum/bad-budget/floor rejection and
subsequent return/redemption are verified. Both processes stopped. Three
worker boundary checks pass. See
`evidence/bridge-bootstrap-agave-rehearsal.json`.

The native attested budget is a hypothetical projection, not a complete
test-validator inventory: exact observed global supply exceeds that budget.
This is deliberate isolated program testing and demonstrates why a committee
attestation alone cannot establish genesis backing. Actual inventory, funded
escrow, custody, full-validator consensus and independent review remain gates.
No previous private fixture was upgraded; no canonical network changed.
