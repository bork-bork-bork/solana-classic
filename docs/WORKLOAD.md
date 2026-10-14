# Measured TEST workload

Current repaired candidate: 35f0eaf1dede45452c9cdf9e6403669e966c427d. Measured 2026-10-13T16:06:14.985Z to 2026-10-13T16:26:24.383Z. Source: evidence/load.json. The earlier c1a7 load remains preserved separately in evidence/load-c1a7.json.

The actual hosted experiment ran 20 SDK sessions, 100 atomic issuances and 100 transfers over 1209.398 seconds. One logical operation started every 6 seconds; confirmation polling occurred at 3-second intervals. Prefunded valueless TEST wallets used unchanged public admission limits. Seed mints prepared before measurement are excluded.

All 200 operations confirmed within 15 seconds. Confirmation latency: p50 3095ms, p95 3150ms, p99 3328ms, maximum 3364ms. Finalisation p95 was 15167ms, measured separately. Gallery verification maximum was 18152ms. Missing confirmations and transaction failures were zero. All 40 frozen-runtime integrity observations passed; cadence and gallery verification passed.

The network service has 4 CPU/16,000,000,000-byte caps, one replica in SFO and a 50,000MB volume ceiling. The QA client has 2 CPU/2,000,000,000-byte caps and pinned Node24.19.0/pnpm10.34.7. Resource caps are not average measured usage.

The first sequential-issuance experiment failed 98.5 percent within 15 seconds; its evidence is retained. Atomic issuance repaired that path. Local transport failures are preserved separately. No failed measurement is relabelled as successful.

This is a bounded application workload, not a Solana-wide capacity or decentralisation benchmark. The original full-day browser stability run completed on 14 October 2026 at 16:48:23.028 UTC / 17:48:23.028 London. It started on 13 October at 16:48:22.762 UTC / 17:48:22.762 London and ran for 86,400.266 seconds. It completed 288 distinct NFT mint-and-transfer journeys and 2,880 observer checks, with no public faucet calls. The full original report, terminal/runtime identity and freeze were archived and re-reviewed in evidence/stability-original-terminal-review.json. This is recorded bounded workload evidence, not independent replay of every transaction from retained chain history. This load result does not certify native SOC, production mainnet or a bridge.


## Evidence and later frontend scope

The complete200-operation load was recalculated from retained receipts/times by
`engine/migration/load_review.py`; see
`evidence/load-original-evidence-review.json`. Its eight regression tests cover
counts, unique signatures, timing, cadence, candidate identity and aggregate
claims. Source and exact report hashes are recorded, without creating a new
workload or importing historical acceptance.

The original frozen website and canonical runtime passed that full-day run.
Later .net wallet, upload and signing changes have separate browser evidence
and do not inherit the original soak. Source-built runtime migration needs a
fresh consistent backup, continuity checks and its own24-hour test. Full
release and monetary mainnet/bridge activation remain unaccepted. Hosting caps
above are configured limits, not measured utilization or independent hardware
specifications. Full machine/publication release review remains pending.
