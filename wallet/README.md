# Classic Wallet

An original, isolated browser wallet prototype for Solana Classic's existing experimental network. It is not a fork of Phantom and is not a production wallet.

## What works

- Disposable in-memory test keypair by default. Optional password-encrypted browser vault restores the same test address after refresh. No seed import or key export.
- Fixed Classic genesis and fixed bounded API. Public Solana chains and mismatched/monetary network descriptions are rejected.
- Public receive address, balance refresh and idempotent test faucet requests.
- Native test transfers with immutable single-use review objects, exact-message fee caps, simulation, chain identity checks before signing/submission, and pending receipt reconciliation. An internal mutation lock protects the session even outside React. No blind resend after an uncertain submission.
- Recent verified network gallery and session transaction receipts with explorer links. Gallery is clearly separate from an owned-asset inventory.
- W2: the same wallet session now creates atomic test NFTs/meme tokens, including PNG/JPG uploads through the site's approved adapter. Mint fees and account rent are reviewed and capped before signing; uncertain results resume the same receipt.
- W2: finalized Token-2022 holdings are independently verified against wallet ownership, positive amounts and immutable mint metadata. Gallery-only, wrong-owner, unsupported and mismatched assets stay out of the owned list.

`tSOC` is a display name for the current valueless TEST denomination. No test balance has a promised conversion, airdrop or allocation. Reloading or closing the tab loses an unsaved account. An explicitly saved wallet stays encrypted in this browser and requires its password after refresh; there is no password recovery. Never send real funds here.

## Run locally without changing the frozen application

Use the pinned Node 24 binary from the repository toolchain. From the repository root:

```sh
node wallet/tools/link-dependencies.mjs
node apps/web/node_modules/vite/bin/vite.js wallet --config wallet/vite.config.mts --configLoader runner
node apps/web/node_modules/vite/bin/vite.js build wallet --config wallet/vite.config.mts --configLoader runner
node node_modules/typescript/bin/tsc --project wallet/tsconfig.json
node --import tsx --test wallet/tests/guards.test.ts wallet/tests/session.test.ts wallet/tests/inventory.test.ts wallet/tests/gateway.test.ts wallet/tests/upload.test.ts wallet/tests/vault.test.ts wallet/tests/vault-session.test.ts
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright-browsers node wallet/tests/browser-qa.mjs
node apps/web/node_modules/vite/bin/vite.js preview wallet --config wallet/vite.config.mts --configLoader runner
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright-browsers node wallet/tests/w2-browser-qa.mjs
```

Existing pinned dependencies are reused; root manifests and lockfiles are unchanged. Local origin `http://127.0.0.1:5188` is not authorized by the live gateway, so live requests may be rejected by CORS. No proxy bypass or gateway change is introduced. Browser QA uses explicitly mocked bounded API/RPC responses. The app needs a separately reviewed, authorized origin before public testnet integration. No live wallet journey is claimed by local QA.

[INTEGRATION.md](INTEGRATION.md) documents lazy same-origin `.net` mounting, scoped CSS, upload/media adapters and keeping the session alive across SPA route changes. W2's production-bundle QA uses localhost `4188` with all service requests mocked.

## Next milestones

1. Independent review of transaction/session behavior and approved-origin testnet integration.
2. Broader NFT standards and larger paginated inventory beyond the current verified Token-2022 view.
3. Keep the implemented shared creation/gallery session mounted in the main site, then extend it to reviewed tipping screens. Add wallet-standard and dApp origin permissions only after the signer interface and approval flow are designed.
4. Decide audited encrypted key vault and recovery approach before persistent accounts. Browser extension packaging, CSP, origin isolation, approval queue, phishing defenses, dependency review and reproducible signed releases are separate security work.
5. Add native SOC mainnet and bridge views only after finalized chain identity, economics and verified bridge interfaces exist. Real Solana SOC and native Classic SOC must remain visibly distinct network balances.

No extension/mobile client, recovery vault, arbitrary dApp signing, swap, mainnet or bridge is shipped in this prototype.

## Dock and optional encrypted persistence

The site mounts `WalletDrawer` once. Desktop reserves space to its right while the rest of the site stays interactive; navigation leaves the wallet open. Small screens use a closable full-width panel. Closing the panel preserves the current session. Panel visibility is a separate nonsecret browser preference.

Saving is explicit. A 12 to 128 character password derives a non-extractable AES-256-GCM key through PBKDF2-SHA-256 with 600,000 iterations and a random 16-byte salt. Every save uses a new 12-byte IV and authenticates the format, pinned devnet genesis and public address. Only ciphertext and public format parameters enter localStorage. Passwords and plaintext keys are never stored. Refresh starts locked. Clearing browser data, a lost password or damaged storage can permanently lose access. There is no server backup or recovery service. This remains a devnet prototype for valueless test assets.

The encrypted recovery journal includes the faucet request ID and uncertain send/creation receipts. It is written before a network mutation. Browser Web Locks and exact stored-record checks reject stale concurrent tabs. Failed encryption, quota, lock support, password checks or revision checks stop the action. Reviews are not restored or silently approved. Saved pending receipts must be reconciled before another creation or send. Locking clears active signing keys and previous review approvals; removing the saved copy requires an unlocked wallet and explicit confirmation.

Saved mode requires WebCrypto, local browser storage and Web Locks. Encryption protects data at rest; it does not protect an unlocked wallet from a compromised browser or malicious same-origin code. Independent security review remains necessary before handling anything of value.
