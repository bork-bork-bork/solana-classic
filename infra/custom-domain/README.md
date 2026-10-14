# Custom domain deployment

`solanaclassic.net` serves a separate frontend derived from the frozen source, with its own logo, About page, navigation and upload controls. Its API base is
`https://solanaclassic.net/_network`, so the address stays on the custom domain.
The bounded Vercel function accepts only the named public gateway routes; browser
POST requests require the exact custom-domain Origin. It forwards to the fixed
Railway gateway using the previously approved frontend Origin. It forwards no
credentials or user-controlled upstream/IP headers and does not bypass the
gateway's RPC, genesis, body-size or rate-limit checks.

The Railway runtime and the original Vercel deployment remain unchanged for the
ongoing stability run. That run certifies its original candidate; this domain
adapter receives separate browser validation. Gateway IP quotas are shared by
requests leaving this adapter. Direct custom-domain CORS support and removal of
the adapter belong to the next tested gateway release.

Build: `python3 infra/custom-domain/build.py`. It checks the frozen files, creates
an ignored source overlay and packages only the public frontend and adapter in
`.tools/custom-domain-site`. Deploy that directory
as the separate `solana-classic-domain` Vercel project. Only public assets and
adapter source are included; no repository credentials or private data.

The adapter forwards image uploads and combined-gallery reads to the separate
image-assets service. Ordinary preset issuance, RPC and faucet requests continue
through the frozen gateway. tSOC is a frontend display name for the same valueless
TEST network units. No wallet imports, real-money token or bridge is enabled.

Enable the approved chain-wide feed during packaging with
`SC_ENABLE_TRANSACTION_FEED=1 python3 infra/custom-domain/build.py`. The separate
image service relays bounded pages from the private read-only block adapter;
see [Explorer adapter](../explorer/README.md). Address details use finalized
RPC account data and distinguish program ownership, token authority and holder
wallets. No market valuation or undeclared creator identity is inferred.

`/wallet` lazily loads Classic Wallet and retains it after its first visit, so the
same in-memory session survives normal SPA navigation. Its mint studio, owned
inventory, gallery and transfers use `/_network`. Reloading, closing the tab or
leaving the SPA discards the key. The legacy Playground retains its own session;
it is not silently migrated. See [Wallet integration](../../wallet/INTEGRATION.md).
No persistent custody or mainnet wallet is claimed.

`/builders` is a curated directory of this repository's tools and prototypes.
`/collectors/:address` reads finalized Token-2022 accounts, verifies token
authority and mint, and displays exact balances. It checks at most 100 token
accounts and labels incomplete views. Gallery artwork does not establish
ownership. Legacy SPL holdings and creator identity are not inferred.

`/uploaded-assets/:hash/metadata.json` and `image.png` are fixed-origin read-only
immutable media proxies with exact paths, bounds and PNG validation. The earlier
preset asset proxy and network admission routes are unchanged. Public browser
and receipt checks remain separate from the frozen stability candidate.
