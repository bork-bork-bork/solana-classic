# Private network rehearsals

These scripts run on the separate source-build worker, never the validator
under the testnet stability run. All keys, ledgers and diagnostic logs stay in
private `/data` directories. Uploaded inputs are public code and checked program
binaries. Export only the named public result JSON files.

`two-chain.py` starts two fresh, independent, loopback-only Agave 3.0.14 test
ledgers. RPC, websocket, faucet, gossip and dynamic ports are separate. It deploys
the compiled bridge through upgradeable-loader transactions with disposable
upgrade authority, then runs `bridge/rehearsal/two-chain.mjs`. The result checks
finalized escrow → native release → native return → original redemption,
replays, a wrong destination, insufficient quorum, empty reserve and exact
counter reconciliation. Three synthetic committee keys co-sign locally. This
does not appoint independent verifiers, demonstrate a trustless bridge or test
an actual Solana production mint. RPC outage/recovery, fork policy, bootstrap
backing and independent security review are separate work.

`validators.py` creates fresh keys for three full `agave-validator` processes,
uses source-built `solana-genesis`, and compiles no engine patches. An unlaunched
budget probe measures all system/vote/feature allocations; the final genesis
reserve is the exact remainder of the synthetic budget. The read-only
`mainnet/genesis-audit` tool enumerates every genesis account. The rehearsal
checks common genesis, participating vote accounts, finalized progress and
runtime inflation/capitalization. All nodes are on one host. They are distinct
node identities, not independent operators or a production consensus result.

Scripts refuse replaying an attempt and reject the soaking or known public
Solana genesi. Retain failed attempts and ledgers before preparing a new attempt;
never reset or copy the soaking ledger. Stop rehearsal processes gracefully.
Serialize the two-ledger and three-validator jobs to bound memory use.

No monetary mainnet, native SOC distribution, original SOC purchase, liquidity
pool, public bridge route or production signer custody is activated. The verified
old source-build record and migration image remain unchanged.

## Controlled process/RPC recovery

`recovery.py` and `bridge/rehearsal/recovery.mjs` reopen only the completed,
stopped private bridge fixture. The source-built test-validator binary is
checksum-pinned. A new `/data/bridge-recovery-v1` directory refuses attempt
replay, any active private validator, public/soaking genesi or changed fixture
identity. A cold tar archive retains the old stopped ledgers and private input
before reopening them; it is not a tested cold restore.

Seven actual checks passed: finalized events and claim receipts exist; each
RPC outage refuses observation; the other ledger's accounts remain unchanged;
both process restarts preserve account bytes, owners, lamports and counters;
consumed native-release/original-redemption claims still reject replay in the
compiled bridge; those simulations leave state unchanged. Zero new broadcasts.
Four Python boundary tests pass:

```sh
python3 -m unittest engine/rehearsal/recovery_test.py
```

The worker recorded SIGINT exits (-2), not application-level graceful flushing.
All four started processes stopped. See `evidence/bridge-ledger-recovery.json`.
Pending-operation settlement, a competing pre-finalized fork, SIGKILL/power
loss, cold restore and independent finality verification remain separate work.
Do not rerun/reset these retained attempts or expose their keys/archives/logs.

## Pending native-claim settlement

`pending.py` imports the recovery helper and stages a new synthetic lock/claim
on the same retained private ledgers. `/data/bridge-pending-v1` refuses an
existing attempt, active private process, changed binary or invalid genesis.
It retains a new stopped-ledger archive before the synthetic operation.
The journal is fsynced before the caller's single claim broadcast. The fault
harness waits for finalization while the client remains unconfirmed, stops
only the private destination RPC, and then reconciles the original signature,
receipt, exact native economic deltas and matching counters after restart.

Six actual checks passed; all three started processes stopped. See
`evidence/bridge-pending-recovery.json` and `bridge/PENDING_CLAIMS.md`.
**The retained private counters are now 700,000 origin units, and nonce 3 is used.**
Do not rerun either passed attempt or assume its earlier 600,000-unit baseline.
Future drills need a new reviewed baseline/directory/nonce. Unknown landing,
expiry/pruning, origin redemption, cold restore and actual fork policy remain
open. None of these fixture balances allocate mainnet SOC.

## Original-token pending redemption

`redemption.py` and `bridge/rehearsal/redemption.mjs` retain a fresh cold archive
in `/data/bridge-redemption-v1`, then stage a 100,000-unit native return (nonce 4)
and one journaled original redemption. Six actual checks pass through an
origin RPC outage/restart; signature/receipt/token debits/credits reconcile.
All three processes stopped. The fault harness waited for finality; no fork
or unknown-landing result. See `evidence/bridge-redemption-recovery.json`.

Current retained private counters are 600,000 on both sides, escrow 600,000 and
original user 1,400,000. **Nonces 3 and 4 are used and new accounts/receipts exist.**
Equal totals do not restore the old baseline. Preserve all passed attempts,
archives and journals; do not rerun/reset them. Future work needs a new reviewed
baseline/directory/nonce. Shared two-direction journal tests total 23.

## Fresh V2 bootstrap execution

`bootstrap.py` and `bridge/rehearsal/bootstrap.mjs` use only a new private
`/data/bridge-bootstrap-v2` directory and fresh loopback ledgers. The source-built
Agave3.0.14 binary, V2 bridge SBF and Token-2022 artifacts are checksum-pinned.
Both deployed programs and upgrade authorities are read back before execution.
The script refuses replay, active private validators, an occupied RPC port,
changed uploaded source or public/soaking/repeated identities. Three Python
boundary checks pass. Source upload uses bounded idempotent binary chunks with
a final checksum; no keys are supplied from the development machine.

This rehearsal uses an explicitly hypothetical two-row native budget. It is
not a complete inventory of the test-validator, whose large global synthetic
supply is read using Python's exact integer JSON parser and retained as a
string. The public result marks `completeInventoryVerified` and
`actualGenesisBackingVerified` false and requires the hypothetical budget to
differ from observed global supply. Successful program execution proves the
V2 wire/state path; it cannot pass B3, full mainnet supply/custody or independent
source-finality gates. A committee can attest a false inventory, so those
independent production checks are material requirements.

The bounded native vault is funded by an actual system transfer; initial source
backing is locked in immutable Token-2022 escrow. The harness verifies zero
native release during bootstrap, initial counters, immutable bootstrap/claim
receipts, replay and altered-recipient rejection, malformed-budget and quorum
rejection, protected-floor limits and subsequent return/redemption. Successful
mutations finalize on the two private Agave ledgers; rejected cases use actual
RPC simulation. Its synthetic committee/authority are local keys, not
independent operators. No retry of an uncertain transaction or production
signer service is implemented. Preserve all private input, journals and logs.

All private processes must stop before exporting the named public result.
SIGINT exit evidence is recorded separately from application-level flushing,
crash or cold restore. Earlier V1 fixture ledgers and program artifacts stay
unchanged. Future recovery attempts require new reviewed directories/baselines.
