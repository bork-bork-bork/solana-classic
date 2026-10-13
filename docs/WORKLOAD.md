# Measured TEST workload

Current repaired candidate: 35f0eaf1dede45452c9cdf9e6403669e966c427d. Measured 2026-10-13T16:06:14.985Z to 2026-10-13T16:26:24.383Z. Source: evidence/load.json. The earlier c1a7 load remains preserved separately in evidence/load-c1a7.json.

The actual hosted experiment ran 20 SDK sessions, 100 atomic issuances and 100 transfers over 1209.398 seconds. One logical operation started every 6 seconds; confirmation polling occurred at 3-second intervals. Prefunded valueless TEST wallets used unchanged public admission limits. Seed mints prepared before measurement are excluded.

All 200 operations confirmed within 15 seconds. Confirmation latency: p50 3095ms, p95 3150ms, p99 3328ms, maximum 3364ms. Finalisation p95 was 15167ms, measured separately. Gallery verification maximum was 18152ms. Missing confirmations and transaction failures were zero. All 40 frozen-runtime integrity observations passed; cadence and gallery verification passed.

The network service has 4 CPU/16,000,000,000-byte caps, one replica in SFO and a 50,000MB volume ceiling. The QA client has 2 CPU/2,000,000,000-byte caps and pinned Node24.19.0/pnpm10.34.7. Resource caps are not average measured usage.

The first sequential-issuance experiment failed 98.5 percent within 15 seconds; its evidence is retained. Atomic issuance repaired that path. Local transport failures are preserved separately. No failed measurement is relabelled as successful.

This is a bounded application workload, not a Solana-wide capacity or decentralisation benchmark. Full uninterrupted 24-hour browser stability remains in progress; its actual start was 13October2026 at16:48:22.762UTC/17:48:22.762London. This load result does not certify native SOC, production mainnet or a bridge.
