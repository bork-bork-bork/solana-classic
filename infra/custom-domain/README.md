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
