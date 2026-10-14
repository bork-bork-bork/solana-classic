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
