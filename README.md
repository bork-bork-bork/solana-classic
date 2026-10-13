# Solana Classic

Experimental SVM playground for memes and NFTs. TEST balances have no monetary value or conversion entitlement. This one-operator network is separate from the proposed Pump-origin SOC launch, native mainnet and 1:1 bridge.

Preview: https://solana-classic-soc.vercel.app. Whitepaper: https://solana-classic-soc.vercel.app/whitepaper.pdf. API: https://network-release-production.up.railway.app. Canonical experimental genesis: `7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon`.

Use Node24 and pnpm10 from the pinned package manifest. The local wrapper selects the isolated toolchain: `python3 scripts/pnpm.py install --frozen-lockfile`, then `typecheck`, `lint`, `test:unit`, `test:integration` or `build`. See CONTRIBUTING.md for safety and command contracts.

Remote checks require `SC_API_URL=https://network-release-production.up.railway.app` and `SC_NETWORK_CONFIG=config/network.remote.json`. `test:e2e` additionally requires `SC_WEB_URL=https://solana-classic-soc.vercel.app` and the pinned isolated Playwright browser. Never substitute a public Solana network or import a real wallet.

Actual SDK/browser journeys and provider restart persistence passed. Two independent agent pilots passed. Cold recovery, alerts, rollback, bounded load and the full24-hour candidate soak remain separate acceptance work. `release:check` intentionally fails until every required check has reviewed, checksum-bound evidence; generating a packet does not release the network. Read docs/STATUS.md and docs/acceptance-report.md for current scope.

The fixed deadline is19 October2026 at03:00:54UTC/04:00:54London. No clock reset or simulated operational proof is allowed. Private test keys, provider credentials, runtime ledgers, tool downloads and generated packet copies stay ignored.
