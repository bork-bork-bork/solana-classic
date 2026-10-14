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
