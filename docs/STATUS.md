# Solana Classic implementation status

Started 2026-10-13 03:00:54 UTC. Deadline 2026-10-19 03:00:54 UTC (04:00:54 London). The clock has not been reset.

The public experimental preview is connected at https://solana-classic-soc.vercel.app, with the API and immutable metadata at https://network-release-production.up.railway.app. Canonical independent genesis: 7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon. It is a valueless TEST devnet with one operator, not mainnet, a live SOC token or bridge.

Official Agave3.0.14 with verified official Token-2022v10 runs on the Railway persistent volume. Earlier failed io_uring/metadata probes and their separate ledgers are retained. Actual chain actions passed through both SDK and production-origin isolated Chromium. The browser journey verified native/token/NFT issuance and transfer, NFT ownership, 1440/360 layouts, explorer refresh, empty wallet storage and wallet loss on reload. The provider restart drill preserved genesis, exact canary balance, mint bytes/supply/authorities, NFT ownership, artwork/metadata hashes, gallery records and the same faucet UUID receipt with no duplicate grant. This proves a container/process restart, not backup restore or hardware-host reboot.

Whitepaper0.4 is published at /whitepaper.pdf. The anonymous response is the exact reviewed PDF SHA25658547e935a61cb3f77714e09d5591fb26b87bc228e307be9379a53e8961c0133. It contains the verified primary Yakovenko quote, cultural mission, future tools, honest checkpoint and proposed Pump-origin/native1:1 model. Its20 pages passed visual QA.

The intended SOC lifecycle is initial Pump.fun launch on Solana, followed by a protected reserve/escrow bridge into native SOC on Classic mainnet. Developer holdings/acquisition, supply/reserve design, fees/inflation, custody, security and later pool funding remain unresolved. No real-token launch or conversion entitlement for TEST is claimed.

The founder chose Railway account email as alert destination and two independent agent pilots in place of human tester bookings for this first release. Both independent agent pilots passed their designated meme and NFT journeys; configuration/delivery of alerts remains unverified. Operator is the founder.

Local fixture checks, typecheck, lint and frontend build passed. No full G0–G7 acceptance is claimed. Cold backup/isolated recovery, external forwarding-header abuse proof, operational alerts, bounded load, full24-hour final-candidate soak, rollback and final pilot/regression/release checks remain required. See evidence files for exact scope.
