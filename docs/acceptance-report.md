# Acceptance report

Generated 2026-10-14T18:17:26.274Z. Scope: offline review of recorded evidence; this command performs no chain or browser actions.

preview/experimental preparation; public release blocked. Local tests and a deployed preview do not certify G0–G7. The founder selected two independent agent browser pilots for this first release; these are agent evidence, not human usability testing.

T0: 2026-10-13T03:00:54+00:00. Fixed H144: 2026-10-19T03:00:54+00:00. A full 24-hour soak still fits before the deadline. The clock is never reset.

| Gate | Result | Passed requirements |
| --- | --- | --- |
| G0 | pending / failed | 0/10 |
| G1 | pending / failed | 0/7 |
| G2 | pending / failed | 0/9 |
| G3 | pending / failed | 0/9 |
| G4 | pending / failed | 0/8 |
| G5 | pending / failed | 0/12 |
| G6 | pending / failed | 7/11 |
| G7 | pending / failed | 2/9 |

## Supporting remote results

These records support review of individual requirements; they never pass an entire gate automatically.

- evidence/chain-smoke-remote.json: result passed; canonical genesis matches; recorded remote operation; review the full result.
- evidence/browser-remote.json: result passed; canonical genesis matches; recorded remote operation; review the full result.
- evidence/restart-check.json: result passed; canonical genesis matches; remote restart only; backup restore is separately required.
- evidence/pilot-agent-one.json: result passed; canonical genesis matches; remote independent agent browser pilot; not human testing.
- evidence/pilot-agent-two.json: result passed; canonical genesis matches; remote independent agent browser pilot; not human testing.

## Blocking inputs

None.

## Unpassed requirements

- G0.01: T0 and H144 are recorded without resetting the clock for delays. — No passed, individually reviewed evidence.
- G0.02: Active official Agave v3.0.14 compatibility release, official Token-2022 v10.0.0, full commits and executable hashes (retain the failed v4.3.0 probe), Node/pnpm patches and exact JavaScript dependency versions recorded. — No passed, individually reviewed evidence.
- G0.03: API/configuration/action schemas agreed by H2; exact SDK and SQLite dependencies proved on Linux by H6. — No passed, individually reviewed evidence.
- G0.04: Local build works; remote host/DNS readiness is accurate; hosting budget uses the recorded needs-based allowance without asking for an obsolete GBP cap. — No passed, individually reviewed evidence.
- G0.05: Canonical remote metadata hostname/origin is fixed and HTTPS asset service reachable; local fixtures have separate genesis/URI configuration. — No passed, individually reviewed evidence.
- G0.06: Vercel team/project access, repository-root build settings and SPA fallback configured by H6; production frontend/API origins selected by H4. — No passed, individually reviewed evidence.
- G0.07: Vercel builds only the static web app; SQLite, generated metadata and ledger stay on Linux; managed Vercel Node patch recorded separately. — No passed, individually reviewed evidence.
- G0.08: Operator, backup storage and two independent agent pilot assignments are arranged before late implementation stages. — No passed, individually reviewed evidence.
- G0.09: Raw API, validator RPC, WebSocket and faucet services cannot be reached from an external machine; only the HTTPS gateway serves public requests. — No passed, individually reviewed evidence.
- G0.10: Mainnet signing keys and browser private keys are absent from source, deployment configuration and logs. — No passed, individually reviewed evidence.
- G1.01: Configured genesis differs from the current Solana mainnet and devnet genesis hashes. — No passed, individually reviewed evidence.
- G1.02: Native TEST transfer has a successful transaction receipt and observed balance change. — No passed, individually reviewed evidence.
- G1.03: Script-based meme-token and NFT issuance both succeed on the remote network by H12, with reachable immutable metadata and verified supply/authorities. — No passed, individually reviewed evidence.
- G1.04: Slot progression, health and executable program IDs are verified on the intended node. — No passed, individually reviewed evidence.
- G1.05: Minimal `/api/assets` returns safe immutable metadata from the permanent remote origin before remote NFT issuance. — No passed, individually reviewed evidence.
- G1.06: Pointing the gateway at an unexpected genesis disables every mutation and reports the mismatch. — No passed, individually reviewed evidence.
- G1.07: The public configuration records operator count 1 and an experimental reset policy. — No passed, individually reviewed evidence.
- G2.01: Browser creates and signs with a memory-only test wallet; its secret never reaches requests, storage or logs. — No passed, individually reviewed evidence.
- G2.02: Fungible demo supply is exactly 1,000,000 display units, decimals 6; transfer to another wallet works. — No passed, individually reviewed evidence.
- G2.03: NFT supply is exactly 1, decimals 0; transfer to a second wallet changes the on-chain owner. — No passed, individually reviewed evidence.
- G2.04: Mint, freeze, pointer and metadata update authorities match the immutable issuance design. — No passed, individually reviewed evidence.
- G2.05: Uncertain atomic issuance is labelled incomplete; Resume reconciles the same mint and retained receipt without duplicate issuance; existing legacy A/B mints remain resumable. — No passed, individually reviewed evidence.
- G2.06: Duplicate clicks and transaction retry produce one logical issuance. — No passed, individually reviewed evidence.
- G2.07: Validator restart preserves genesis, balances, mints and ownership. — No passed, individually reviewed evidence.
- G2.08: The thin remote browser journey includes an actual transaction receipt and asset verification; fixtures are never substituted for remote proof. — No passed, individually reviewed evidence.
- G2.09: G2 runs from the actual Vercel production origin by H24 with matching public API/genesis build variables, successful JSON preflight/POST and refreshed explorer deep link. — No passed, individually reviewed evidence.
- G3.01: A clean browser can create wallet, claim test funds, create token, mint NFT and transfer assets over HTTPS. — No passed, individually reviewed evidence.
- G3.02: All signing screens say TESTNET and no monetary value; wallet loss on reload is disclosed. — No passed, individually reviewed evidence.
- G3.03: Real-token release/purchase links are separate from test-wallet controls. — No passed, individually reviewed evidence.
- G3.04: Expired blockhash, failed simulation and rejected transaction produce actionable errors and no false success. — No passed, individually reviewed evidence.
- G3.05: Hostile asset names render as text and cannot execute markup or scripts. — No passed, individually reviewed evidence.
- G3.06: The testnet browser bundle has no mainnet RPC destination or private-key import. — No passed, individually reviewed evidence.
- G3.07: Browser requests use the explicit Linux API base; immutable metadata URLs never point to a preview deployment, frontend hostname or localhost. — No passed, individually reviewed evidence.
- G3.08: Initial reboot and isolated backup/restore drill passed by H36; baseline gallery/transaction/status views work by H48. — No passed, individually reviewed evidence.
- G3.09: Concrete preliminary token-release packet prepared by H48; venue/mode/zero-buy feasibility was checked by H24. — No passed, individually reviewed evidence.
- G4.01: Transaction pages show actual status, slot, error and signature from the configured network. — No passed, individually reviewed evidence.
- G4.02: Gallery registration rejects forged mint, forged signature, wrong metadata, wrong program and wrong genesis. — No passed, individually reviewed evidence.
- G4.03: NFT transfer is reflected in current owner information; cached gallery ownership is not treated as proof. — No passed, individually reviewed evidence.
- G4.04: Artwork/metadata remain readable at the same content-hashed paths after app restart. — No passed, individually reviewed evidence.
- G4.05: Network outage displays degraded status instead of stale online/success indicators. — No passed, individually reviewed evidence.
- G4.06: Explorer scope is disclosed as account/transaction lookup and app-known assets, not exhaustive indexing. — No passed, individually reviewed evidence.
- G4.07: Two independent agent testers attempted the clean-browser journey at H48–H60; findings are recorded and failed journeys rerun before the H72 freeze. — No passed, individually reviewed evidence.
- G4.08: Filters, rich address inventory and extra artwork are cuttable; they do not block the verified baseline. — No passed, individually reviewed evidence.
- G5.01: Public RPC rejects airdrop, administrative methods, arbitrary upstream URLs, batches and excessive bodies. — No passed, individually reviewed evidence.
- G5.02: Faucet rejects malformed keys; atomic limits work under concurrent requests and after restart. — No passed, individually reviewed evidence.
- G5.03: A request timeout cannot trigger a second faucet grant; pending transactions reconcile by signature. — No passed, individually reviewed evidence.
- G5.04: Forged forwarding headers cannot bypass rate limits. — No passed, individually reviewed evidence.
- G5.05: Exact production/approved preview CORS origins work; unknown browser origins fail; OPTIONS creates no faucet reservation or mutation; server-side admission remains effective without Origin headers. — No passed, individually reviewed evidence.
- G5.06: Asset creation obeys body/generated-file/per-IP/global/storage limits from its first exposure; identical content is idempotent. — No passed, individually reviewed evidence.
- G5.07: Disk, memory, stalled-slot and upstream-health probes work and their operator destination is verified. — No passed, individually reviewed evidence.
- G5.08: Provider process/container restart and a fresh deployment preserve state; hardware-host reboot is outside Railway operator control. — No passed, individually reviewed evidence.
- G5.09: Isolated cold-backup restore recovers the same genesis, balances, assets, metadata and database records. — No passed, individually reviewed evidence.
- G5.10: Test scripts fail closed if directed at a real-money network. — No passed, individually reviewed evidence.
- G5.11: Source/artwork/upstream notices and configuration contain no secrets. — No passed, individually reviewed evidence.
- G5.12: Previous verified Vercel deployment can be restored; production API/status responses are fresh and environment settings are distinct from previews. — No passed, individually reviewed evidence.
- G6.05: The load test uses unchanged admission controls; separately test expected 429 responses under abuse. — No passed, individually reviewed evidence.
- G6.08: Repair core runtime/gateway/signing/minting/faucet/storage/recovery defects immediately and run a new full 24-hour soak. H96–H108 repair plus H108–H132 replacement soak is the reserved late-failure window. If time expires first, the public release gate remains failed. — No passed, individually reviewed evidence.
- G6.09: Documentation/static-copy/art-selection/mainnet-link changes receive targeted content/browser checks; they do not reset core stability evidence. Executable content, metadata origins and signing logic are excluded from this exception. — No passed, individually reviewed evidence.
- G6.10: Publish machine specification, workload, failures, latency distribution and exact test duration. — No passed, individually reviewed evidence.
- G7.02: Mobile 360 px and desktop 1440 px views are usable; keyboard navigation, labels and focus states work. — No passed, individually reviewed evidence.
- G7.03: Public URL, actual genesis, software manifest, operator count and limitations are accessible. — No passed, individually reviewed evidence.
- G7.05: `pnpm release:check` passes every required public-testnet check. — Every other required check must pass first.
- G7.06: Operator receives restart, backup, recovery and monitoring runbooks and verifies access. — No passed, individually reviewed evidence.
- G7.07: Handover includes the Vercel project, deployment ID, public environment/DNS settings and verified frontend rollback alongside Linux runbooks. — No passed, individually reviewed evidence.
- G7.08: Release statement distinguishes experimental devnet, initial SOC token, future native mainnet and planned 1:1 bridge. — No passed, individually reviewed evidence.
- G7.09: Testnet release is evaluated independently of pending founder-operated token creation; a prepared token does not hold up a passed network release. — No passed, individually reviewed evidence.

## Separate SOC release states and unresolved inputs

Pump token: not verified by testnet release checks; separate founder authorization and evidence required. Native mainnet: not verified; separate readiness and release decision required. Bridge: not verified; two-way redemption and reserve conservation require separate proof. TEST assets have no monetary value or conversion entitlement. Pending real-token creation does not block a fully accepted TEST network.

- separate_authorized_Pump_token_creation
- SOC_developer_holdings_and_acquisition
- native_SOC_supply_reserve_and_bridge_security_design

## Recording gate evidence

Create public evidence/acceptance-gates.json with schemaVersion 1, scope remote-experimental, canonical genesis, checklistSha256, and candidate fields apiOrigin, frontendOrigin, frontendDeploymentId, frontendCommit, apiCommit, networkConfigSha256 and dependencyManifestSha256. Under requirements, use the stable IDs above. Each entry needs passed:true, scope (remote/repository/operator), verifiedAt, and proofs:[{path,sha256}]. Each referenced bounded JSON result must itself have passed:true and explicit scope; remote proofs must carry the canonical genesis. G6 proofs must also include the entire frozen candidate object. Fixtures, aggregate test summaries, symlinks and release aggregates are rejected. Review every checklist item individually. G7's release:check item is derived from the other checks to avoid a circular prerequisite.
