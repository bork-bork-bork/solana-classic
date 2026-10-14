# Classic Wallet

An original, isolated browser wallet prototype for Solana Classic's existing experimental network. It is not a fork of Phantom and is not a production wallet.

## What works

- Disposable in-memory test keypair; no seed import, export, localStorage or secret persistence.
- Fixed Classic genesis and fixed bounded API. Public Solana chains and mismatched/monetary network descriptions are rejected.
- Public receive address, balance refresh and idempotent test faucet requests.
- Native test transfers with immutable single-use review objects, exact-message fee caps, simulation, chain identity checks before signing/submission, and pending receipt reconciliation. An internal mutation lock protects the session even outside React. No blind resend after an uncertain submission.
- Recent verified network gallery and session transaction receipts with explorer links. Gallery is clearly separate from an owned-asset inventory.

`tSOC` is a display name for the current valueless TEST denomination. No test balance has a promised conversion, airdrop or allocation. Closing/reloading the page loses access to the disposable account. Never send real funds here.

## Run locally without changing the frozen application

Use the pinned Node 24 binary from the repository toolchain. From the repository root:

```sh
node apps/web/node_modules/vite/bin/vite.js wallet --config wallet/vite.config.mts --configLoader runner
node apps/web/node_modules/vite/bin/vite.js build wallet --config wallet/vite.config.mts --configLoader runner
node node_modules/typescript/bin/tsc --project wallet/tsconfig.json
node --import tsx --test wallet/tests/guards.test.ts wallet/tests/session.test.ts
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright-browsers node wallet/tests/browser-qa.mjs
```

Existing pinned dependencies are reused; root manifests and lockfiles are unchanged. Local origin `http://127.0.0.1:5188` is not authorized by the live gateway, so live requests may be rejected by CORS. No proxy bypass or gateway change is introduced. Browser QA uses explicitly mocked bounded API/RPC responses. The app needs a separately reviewed, authorized origin before public testnet integration. No live wallet journey is claimed by local QA.

## Next milestones

1. Independent review of transaction/session behavior and approved-origin testnet integration.
2. Wallet-owned fungible token and NFT inventory, using bounded pagination and on-chain ownership rather than gallery membership.
3. Reuse the same wallet session in creation/gallery/tipping screens. Add wallet-standard and dApp origin permissions only after the signer interface and approval flow are designed.
4. Decide audited encrypted key vault and recovery approach before persistent accounts. Browser extension packaging, CSP, origin isolation, approval queue, phishing defenses, dependency review and reproducible signed releases are separate security work.
5. Add native SOC mainnet and bridge views only after finalized chain identity, economics and verified bridge interfaces exist. Real Solana SOC and native Classic SOC must remain visibly distinct network balances.

No extension/mobile client, recovery vault, arbitrary dApp signing, swap, mainnet or bridge is shipped in this prototype.
