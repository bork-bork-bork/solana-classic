# Solana Classic release acceptance checks

Operator acceptance update (13 October 2026): the founder selected Railway account email as the alert destination and two independent agent pilots in place of external human testers for this first release. Record agent pilot scope accurately. Alert configuration/delivery, finding resolution and final browser regression still require proof.


Current founder decisions: read [Native SOC and hosting decisions](NATIVE_SOC_DECISION.md) first. SOC uses a Pump-first, intended 1:1 native bridge lifecycle. Hosting is Vercel plus Railway; the earlier VPS and separate-community-token instructions are superseded. The six-day TEST devnet gates and fixed clock are unchanged.

The implementation is complete only for the release state supported by passing checks. Tests run against the designated experimental network; real-token creation is an owner-operated release with a separate evidence record. Store machine-readable results under `evidence/` and a human-readable summary in `docs/acceptance-report.md`.

## G0 dependencies and resources by H6

- [ ] T0 and H144 are recorded without resetting the clock for delays.
- [ ] Active official Agave v3.0.14 compatibility release, official Token-2022 v10.0.0, full commits and executable hashes (retain the failed v4.3.0 probe), Node/pnpm patches and exact JavaScript dependency versions recorded.
- [ ] API/configuration/action schemas agreed by H2; exact SDK and SQLite dependencies proved on Linux by H6.
- [ ] Local build works; remote host/DNS readiness is accurate; hosting budget uses the recorded needs-based allowance without asking for an obsolete GBP cap.
- [ ] Canonical remote metadata hostname/origin is fixed and HTTPS asset service reachable; local fixtures have separate genesis/URI configuration.
- [ ] Vercel team/project access, repository-root build settings and SPA fallback configured by H6; production frontend/API origins selected by H4.
- [ ] Vercel builds only the static web app; SQLite, generated metadata and ledger stay on Linux; managed Vercel Node patch recorded separately.
- [ ] Operator, backup storage and two independent agent pilot assignments are arranged before late implementation stages.
- [ ] Raw API, validator RPC, WebSocket and faucet services cannot be reached from an external machine; only the HTTPS gateway serves public requests.
- [ ] Mainnet signing keys and browser private keys are absent from source, deployment configuration and logs.

## G1 independent execution by H12

- [ ] Configured genesis differs from the current Solana mainnet and devnet genesis hashes.
- [ ] Native TEST transfer has a successful transaction receipt and observed balance change.
- [ ] Script-based meme-token and NFT issuance both succeed on the remote network by H12, with reachable immutable metadata and verified supply/authorities.
- [ ] Slot progression, health and executable program IDs are verified on the intended node.
- [ ] Minimal `/api/assets` returns safe immutable metadata from the permanent remote origin before remote NFT issuance.
- [ ] Pointing the gateway at an unexpected genesis disables every mutation and reports the mismatch.
- [ ] The public configuration records operator count 1 and an experimental reset policy.

## G2 asset and signing proof by H24

- [ ] Browser creates and signs with a memory-only test wallet; its secret never reaches requests, storage or logs.
- [ ] Fungible demo supply is exactly 1,000,000 display units, decimals 6; transfer to another wallet works.
- [ ] NFT supply is exactly 1, decimals 0; transfer to a second wallet changes the on-chain owner.
- [ ] Mint, freeze, pointer and metadata update authorities match the immutable issuance design.
- [ ] Uncertain atomic issuance is labelled incomplete; Resume reconciles the same mint and retained receipt without duplicate issuance; existing legacy A/B mints remain resumable.
- [ ] Duplicate clicks and transaction retry produce one logical issuance.
- [ ] Validator restart preserves genesis, balances, mints and ownership.
- [ ] The thin remote browser journey includes an actual transaction receipt and asset verification; fixtures are never substituted for remote proof.
- [ ] G2 runs from the actual Vercel production origin by H24 with matching public API/genesis build variables, successful JSON preflight/POST and refreshed explorer deep link.

## G3 remote user journey by H48

- [ ] A clean browser can create wallet, claim test funds, create token, mint NFT and transfer assets over HTTPS.
- [ ] All signing screens say TESTNET and no monetary value; wallet loss on reload is disclosed.
- [ ] Real-token release/purchase links are separate from test-wallet controls.
- [ ] Expired blockhash, failed simulation and rejected transaction produce actionable errors and no false success.
- [ ] Hostile asset names render as text and cannot execute markup or scripts.
- [ ] The testnet browser bundle has no mainnet RPC destination or private-key import.
- [ ] Browser requests use the explicit Linux API base; immutable metadata URLs never point to a preview deployment, frontend hostname or localhost.
- [ ] Initial reboot and isolated backup/restore drill passed by H36; baseline gallery/transaction/status views work by H48.
- [ ] Concrete preliminary token-release packet prepared by H48; venue/mode/zero-buy feasibility was checked by H24.

## G4 verified discovery and first agent pilot by H60

- [ ] Transaction pages show actual status, slot, error and signature from the configured network.
- [ ] Gallery registration rejects forged mint, forged signature, wrong metadata, wrong program and wrong genesis.
- [ ] NFT transfer is reflected in current owner information; cached gallery ownership is not treated as proof.
- [ ] Artwork/metadata remain readable at the same content-hashed paths after app restart.
- [ ] Network outage displays degraded status instead of stale online/success indicators.
- [ ] Explorer scope is disclosed as account/transaction lookup and app-known assets, not exhaustive indexing.
- [ ] Two independent agent testers attempted the clean-browser journey at H48–H60; findings are recorded and failed journeys rerun before the H72 freeze.
- [ ] Filters, rich address inventory and extra artwork are cuttable; they do not block the verified baseline.

## G5 operations and negative tests by H72

- [ ] Public RPC rejects airdrop, administrative methods, arbitrary upstream URLs, batches and excessive bodies.
- [ ] Faucet rejects malformed keys; atomic limits work under concurrent requests and after restart.
- [ ] A request timeout cannot trigger a second faucet grant; pending transactions reconcile by signature.
- [ ] Forged forwarding headers cannot bypass rate limits.
- [ ] Exact production/approved preview CORS origins work; unknown browser origins fail; OPTIONS creates no faucet reservation or mutation; server-side admission remains effective without Origin headers.
- [ ] Asset creation obeys body/generated-file/per-IP/global/storage limits from its first exposure; identical content is idempotent.
- [ ] Disk, memory, stalled-slot and upstream-health probes work and their operator destination is verified.
- [ ] Provider process/container restart and a fresh deployment preserve state; hardware-host reboot is outside Railway operator control.
- [ ] Isolated cold-backup restore recovers the same genesis, balances, assets, metadata and database records.
- [ ] Test scripts fail closed if directed at a real-money network.
- [ ] Source/artwork/upstream notices and configuration contain no secrets.
- [ ] Previous verified Vercel deployment can be restored; production API/status responses are fresh and environment settings are distinct from previews.

## G6 first stability result by H96 with replacement window to H132

- [ ] Keep 20 active sessions; run 100 issuances and 100 transfers over 20 minutes, starting one logical operation every six seconds with pre-funded wallets. Poll at three-second intervals and preserve public admission limits.
- [ ] At least 99 percent of supported logical operations confirm within 15 seconds under the stated workload.
- [ ] Target p95 **confirmed** latency is at most 5 seconds; finalisation is measured separately and never described as instant.
- [ ] Gallery finalisation/verification completes within 60 seconds in the measured experiment.
- [ ] The load test uses unchanged admission controls; separately test expected 429 responses under abuse.
- [ ] Complete agent pilot, reboot, restore and bounded-load drills before H72. Then run an uninterrupted H72–H96 soak with one scheduled smoke journey every five minutes from pre-funded accounts; no unexplained restart or stalled network. Test faucet claims separately within the public limits.
- [ ] Scheduled browser smoke checks use the frozen Vercel production deployment and Linux API; record both deployed commits/configuration and the frontend deployment ID.
- [ ] Repair core runtime/gateway/signing/minting/faucet/storage/recovery defects immediately and run a new full 24-hour soak. H96–H108 repair plus H108–H132 replacement soak is the reserved late-failure window. If time expires first, the public release gate remains failed.
- [ ] Documentation/static-copy/art-selection/mainnet-link changes receive targeted content/browser checks; they do not reset core stability evidence. Executable content, metadata origins and signing logic are excluded from this exception.
- [ ] Publish machine specification, workload, failures, latency distribution and exact test duration.
- [ ] Do not present the workload as a Solana-wide throughput or decentralisation benchmark.

## G7 first release target H108 and final deadline H144

- [ ] First agent pilot ran before H72; final clean-browser regression runs at H96–H108, or after the replacement soak, without developer intervention.
- [ ] Mobile 360 px and desktop 1440 px views are usable; keyboard navigation, labels and focus states work.
- [ ] Public URL, actual genesis, software manifest, operator count and limitations are accessible.
- [ ] Production frontend/deep links and API metadata are reachable anonymously with correct HTTPS/DNS; no deployment login blocks the final public journey.
- [ ] `pnpm release:check` passes every required public-testnet check.
- [ ] Operator receives restart, backup, recovery and monitoring runbooks and verifies access.
- [ ] Handover includes the Vercel project, deployment ID, public environment/DNS settings and verified frontend rollback alongside Linux runbooks.
- [ ] Release statement distinguishes experimental devnet, initial SOC token, future native mainnet and planned 1:1 bridge.
- [ ] Testnet release is evaluated independently of pending founder-operated token creation; a prepared token does not hold up a passed network release.

## SOC launch and future native bridge preparation

- [ ] Solana Classic / SOC artwork, metadata and project links reviewed.
- [ ] Initial Pump.fun route and current creation settings verified; actual mint, supply and authorities published only after authorized creation.
- [ ] Developer holdings, acquisition method, wallets, spending cap and any vesting are explicit; no arbitrary free developer allocation assumed.
- [ ] Proposed 1:1 escrow/native-reserve conservation, decimals, fees/inflation, finality, replay and failure handling specified.
- [ ] Mainnet, bridge security, custody, upgrades and future pool funding are scoped separately from the six-day TEST network.
- [ ] Redemption is labelled planned until actual two-way operations and reserve backing are verified.
- [ ] TEST and test NFTs carry no automatic SOC conversion or future allocation.
- [ ] Founder signs real-token creation/purchases only under a concrete separate release decision.

A prepared packet is not a live token or redemption facility. Failed network gates remain failed; only the scope that actually passed may be published.
