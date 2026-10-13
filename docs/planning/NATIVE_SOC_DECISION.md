# Solana Classic native SOC and hosting decisions

The founder intends one economic asset: SOC launches first on Solana through Pump.fun and later becomes usable as the native transaction-fee asset of Solana Classic through a two-way 1:1 bridge. This supersedes the earlier separate community-token model. The six-day release remains an experimental TEST devnet, not production mainnet or a live bridge.

## Founding purpose

Build a focused home for meme and NFT communities, where buyers and creators can inspect how projects distribute supply and capture value. The founder believes Solana's expanding priorities have displaced attention from these communities. This is the project's cultural thesis, not a proven single cause of extraction.

The future product should make developer holdings, known wallet concentration, unlock terms, fees and creator funding visible. Distinguish enforceable on-chain controls from voluntary disclosures. Open SVM execution alone cannot prohibit unrelated applications or prevent extraction. Proposed launch standards and tools must have their own implementation milestones and measurable adoption.

## Intended token lifecycle

1. Prepare a standard SOC launch through Pump.fun on Solana. Read current venue parameters and disclose actual supply, mint, authorities, founder acquisition and holdings before claiming any allocation. Creation does not automatically allocate an arbitrary developer reserve. No real token creation or purchase is authorized merely by this implementation plan.
2. Design Solana Classic mainnet genesis and native SOC economics. Native SOC is a chain balance, not another SPL mint. Reserve the native units required for migration rather than independently distributing duplicate spendable supply.
3. Implement the intended 1:1 display-unit bridge: finalize original SOC escrow on Solana, then release exactly matching native SOC from the protected Classic reserve. Returning native SOC to the reserve must precede unlock of original tokens on Solana.
4. Verify chain identities, decimals, replay protection, finality, failure reconciliation, native fee effects, reserve custody, upgrades, pause controls and redemption availability. Independent issuance or validator inflation cannot silently enlarge the economically spendable supply.
5. Activate native SOC, bridge redemption and any future liquidity pool only after mainnet and bridge readiness, funded liquidity, reviewed security and the founder's concrete release decision. Initial Pump bonding-curve trading and later PumpSwap graduation happen on Solana; a future Classic-chain pool is a separate venue and deployment.

The target is 1 SOC on Solana to 1 native SOC on Classic, with transaction/bridge fees disclosed separately. This is an intended conversion mechanism, not an existing redemption facility. TEST, experimental NFTs and testnet balances have no promised conversion or allocation. Developer holding amount, acquisition method, vesting, security operators and future liquidity funding remain unresolved.

## Current hosting choice

Frontend stays on Vercel Pro at https://solana-classic-soc.vercel.app. The founder confirmed no OVHcloud account and an existing Railway Pro account. Use a dedicated new Railway project, one always-on backend container, a persistent /data volume and provider HTTPS ingress. Keep Agave RPC and faucet unexposed to the public; only the bounded API on port 3000 receives a domain. No TCP proxy, public raw RPC domain, shared project services or sleeping runtime. The API uses fixed loopback upstream and trusts only the nearest Railway ingress hop, subject to external spoofing tests.

Railway project 356bcb0b-49c4-4bd3-bf10-bff7db8f33fe. Active service `network-release` d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6, persistent volume 080bf785-50e7-4dda-893b-4d613aa5e9a8. Permanent API/asset origin https://network-release-production.up.railway.app. Canonical independent genesis `7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon`. Compute caps are 4 vCPUs and 16 GB RAM, one always-on replica in SFO. Official Agave3.0.14 with checksum-verified official Token-2022v10 passes remote SDK native/token/NFT actions. Restart, recovery, browser, load and soak evidence remains separately required.

Earlier `network` and `network-compatible` services/volumes are retained as failed compatibility probes. They do not identify the active chain. The first failed on mandatory io_uring in Agave4.3.0; the second exposed a documented bundled Token-2022 metadata bug. See docs/COMPATIBILITY.md. No gate passes merely because a service was created.

Persistent ledger, database, immutable artwork, public genesis configuration and protected test operator files live on the same volume. Keep one replica and no overlapping writers. Railway service restarts/backups replace the original VPS systemd/Caddy commands; preserve the same acceptance outcomes and record actual provider evidence. Restore first into an isolated service/volume. Never auto-reset a missing or mismatched ledger/config pair.

Sources: [Pump creation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md), [Pump trading and graduation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md), [Railway volumes](https://docs.railway.com/volumes/reference), [Railway plans and resource prices](https://docs.railway.com/pricing/plans), [Vercel bounded function resources](https://vercel.com/docs/functions/limitations).

## Pilot and alert decision

On 13 October 2026 the founder selected Railway account email for hosting alerts and agent testing for the first release. Two independent agent pilots replace the original human-tester booking requirement. Label them agent pilots and preserve their findings/receipts; do not imply human usability research. Alert delivery must still be verified.
