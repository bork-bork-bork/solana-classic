# One wallet, a focused first ecosystem

Decision prepared 14 October 2026: build an original Classic Wallet with the repository's pinned Solana SDK and chain helpers. Keep the first version inside the Classic site as a single browser application. A native mobile app and extension follow a reviewed signer/recovery design; they do not have to block the current testnet.

## Fork research

| Candidate | Verified source situation | Recommendation |
|---|---|---|
| Phantom | Official public organization publishes a Connect SDK, examples and ancillary projects. Its Connect SDK is an integration library; these sources do not establish that the complete extension/mobile wallet client is available to fork. | Do not advertise a Phantom fork. A future Solana-side bridge frontend may integrate Phantom's published provider, but that is distinct from a native Classic wallet and does not establish custom-chain support. |
| Backpack | The current `coral-xyz/backpack` master root LICENSE is GPLv3. A 2023 complaint about a non-commercial license is historical and does not describe today's root file. | A source fork is a real option if we choose a GPL distribution model and review all applicable package licenses. Pin a commit and audit dependencies/security assumptions before any reuse. It brings a broad extension/mobile monorepo that is slower to narrow than today's original prototype. |
| Sollet / SPL Token Wallet | Root LICENSE is Apache-2.0. The README calls it a developer tool and says ordinary issues/PRs are not actively supported. It describes browser localStorage key storage. | Useful historical reference, but not an unreviewed production wallet base. Do not inherit the persistence model or treat the legacy code as a ready secure release. |

Primary sources checked:

- [Phantom's official GitHub organization](https://github.com/phantom)
- [Phantom Connect SDK](https://github.com/phantom/phantom-connect-sdk)
- [Phantom provider integration documentation](https://docs.phantom.com/solana/integrating-phantom)
- [Backpack source](https://github.com/coral-xyz/backpack) and [current root LICENSE](https://raw.githubusercontent.com/coral-xyz/backpack/master/LICENSE)
- [Sollet source and maintenance notice](https://github.com/project-serum/spl-token-wallet) and [Apache-2.0 license](https://github.com/project-serum/spl-token-wallet/blob/master/LICENSE)

## What the first wallet provides

One account session, balance, receive address, test faucet, native test send with a review step, public creation gallery, and transaction receipts. The prototype pins the existing experimental genesis. It accepts neither mainnet identities nor imported third-party seeds. It has no persistent secrets, bridge or commercial-value balance.

The product target is one wallet with clearly separated **Solana** and **Classic** network views, with original Solana SOC and native Classic SOC labeled independently. A 1:1 bridge does not make them the same account balance. Future support needs separate verified chain profiles and transaction approvals, not a silently interchangeable RPC URL. Reserve transparency and bridge status should be read-only until the bridge implementation has passed its release gates.

## Fastest useful applications

These are planning estimates for a focused prototype after the wallet origin/session interface is approved, not audited mainnet launch dates. Keep development isolated while the existing frozen stability candidate runs.

| Application | What people can actually do | Existing implementation to reuse | Approximate prototype effort | Extra release dependency |
|---|---|---|---|---|
| Culture gallery and collector pages | Browse creations, inspect holders, share an NFT page or creator collection | Verified gallery, immutable artwork, explorer and bounded token-account RPC | 0.5–1.5 developer-days | Pagination, ownership verification, safe media and mobile QA |
| Classic mint studio | Create test art/NFTs and meme tokens with the same account, then share their receipts | Existing atomic Token-2022 issuance and art pipeline | 1–2 developer-days | Shared session interface; custom-image validation; no leakage of signing keys between routes |
| Builder/project directory | Discover community projects, their public source, demo and contributor needs | GitHub links, site pages and static project manifests | 0.5–1 developer-day | Real project submissions and curation; listings must not imply endorsement/security certification |
| Creator tips and gift links | Review a recipient and amount, then send a native test tip with a receipt | Wallet transfer review and explorer | 1–2 developer-days | Strict network/address/amount parsing, deliberate signing; no automatic transfer from a link |
| Community collectible wall | Publish themed collections and display verified community-made art | Gallery collections, artwork and creator addresses | 1–2 developer-days | Collection membership/provenance design; moderation and media limits |
| Ownership-based community access | Prove control of a wallet and current possession of a chosen collectible | SDK signatures, bounded on-chain ownership reads | 2–4 developer-days | Domain-bound nonces, expiry/replay protection, permission model, separate reviewed auth service |

Recommended first sequence: **wallet + mint studio + gallery/collector pages**, then creator tips and builder directory. This gives communities one coherent loop—create, hold, share, discover and support each other—rather than several half-built applications.

DEX/AMM liquidity, NFT trading escrow, launchpad economic rules, real-funds bridge and persistent production key custody are separate programs and security work. A frontend fork cannot make them safe or complete. Build them behind explicit protocol milestones, with developer participation and review.

## Wallet release order

1. Current milestone: original source prototype; local build/typecheck; guard tests; desktop/mobile browser journey with fully mocked bounded API/RPC. This is evidence of client behavior, not a live-network wallet release.
2. Approved-origin integration on the experimental testnet. Independent client review, real valueless journey, wrong-genesis and pending-submission reconciliation tests. Do not modify the frozen live gateway during its soak.
3. Owned-asset inventory and unified creation/gallery session. The gallery itself is not proof of ownership.
4. Extension/mobile decision: pin/review a GPL Backpack fork **or** package the original reviewed signer; encrypted key vault, recovery, CSP, origin permissions, phishing/transaction simulation and reproducible signed updates are mandatory design work before funds.
5. Finalized native SOC mainnet profile and read-only bridge/reserve status.
6. Real-value wallet and bridge approval only after protocol security review, operational readiness and a concrete mainnet release decision. This prototype's ephemeral account is not a production recovery plan.
