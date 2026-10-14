# Solana Classic operator handover

The founder operates this experimental TEST service. Automated tooling supplies implementation and test evidence; they do not provide unattended operations. Browser wallets are disposable and memory-only. There is no production SOC, mainnet bridge or conversion entitlement.

## Service inventory

Vercel team `trenchfun1`, project `solana-classic`, project ID `prj_mjv3k9UcoPgxoNvDl2foOIC8R3V9`. Public origin https://solana-classic-soc.vercel.app. Frozen frontend deployment `dpl_3aWWzKDohr4SrgijgrB8dWgHHS5r`, immutable URL https://solana-classic-imbi46jmv-trenchfun1.vercel.app.

Railway project `356bcb0b-49c4-4bd3-bf10-bff7db8f33fe`, production environment `3367b373-2332-4702-8cce-c12b8f03949e`. Network service `d0a1de40-bd9c-47eb-a7fc-477f1c55b2d6`, volume `080bf785-50e7-4dda-893b-4d613aa5e9a8` at `/data`. HTTPS API https://network-release-production.up.railway.app. Keep one always-on replica, four CPU /16,000,000,000-byte memory cap, 50,000MB volume ceiling and port3000 ingress. Private validator RPC stays at loopback8899; do not create a TCP proxy or expose raw RPC/WebSocket/faucet.

Independent genesis: `7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon`. Executable source 35f0eaf1dede45452c9cdf9e6403669e966c427d, core manifest 30697f3e9b441b05a036d0704b42322d723b3998840ed43d88b18a0d7ef7d1dd. Read `/api/runtime` for actual current deployment and process boot IDs. Official Agave3.0.14 and Token-2022v10.0.0 binary hashes are recorded in evidence/active-linux-manifest.json and docs/token-program-release.json.

The repository is the local Git checkout on branch `build/six-day-mvp`. Public source is at https://github.com/solana-classic/solana-classic. Root Vercel configuration builds the static web package; API, SQLite and generated assets are not Vercel functions. Public build variables identify the fixed API and genesis; no signer belongs in a VITE variable. The separately verified public frontend is https://solanaclassic.net; the original provider frontend remains the frozen stability candidate.

## Routine checks and alerts

Inspect `/healthz`, `/api/status`, `/api/runtime` and the [independent monitor](https://operator-monitor-production.up.railway.app/api/monitor). Verify canonical genesis, advancing finalized slots and expected executable identity. Railway account email routes project failure/OOM, memory, volume and monitor events. The operator confirmed actual failure and monitor/recovery email receipt. See [monitoring runbook](MONITORING.md) for thresholds, derived health signal and observed provider notification delay.

Inspect usage bills and volume growth. Do not raise caps, delete immutable assets, reset the chain or replace operator keys in response to an alert without reviewing the actual cause. A genesis mismatch must keep mutations disabled. The one-node network and same-provider monitor are not decentralized or resistant to provider-wide outages.

## Restart and deployment

Before maintenance, record runtime identity, canonical genesis and known balances/mints/owners/asset hashes/database rows. Keep a protected recovery copy. The actual tests use provider container/process restart, not hardware host reboot. `python3 scripts/pnpm.py ops:restart-check` creates a new continuity baseline and performs a bounded provider restart; preserve existing baseline files first if a cold recovery record references their checksum. The final-build reconfirmation helper instead reuses the original receipt and does not request a new payment.

Use pinned toolchains and sanitized source-only upload inventories. Never upload `.data`, `.tools`, environment files, operator files, ledgers or credentials as build context. A normal deployment must reuse the existing volume and reject missing/mismatched ledger/config pairs. Do not enable test prefunding on normal startup. Capture new boot IDs and verify preserved state after maintenance.

During a soak, any API/validator/QA restart interrupts acceptance. A full new24hours is required. Source, signing, genesis, metadata-origin or recovery changes require a new executable freeze. See [hosted QA runbook](HOSTED_QA.md) for activation, persistent evidence and attempt records.

## Backup and isolated recovery

Daily/weekly Railway volume backups are configured. Current native backup `a15ed771-485f-4abd-adb9-cf86b8ba3ae0` is recorded in evidence/provider-backup-configuration.json. Scheduling a snapshot alone does not prove consistent live ledger/SQLite recovery.

The tested recovery copy is a stopped-writer cold archive: `/data/backups/current.tar.gz`, 983,189,101bytes, SHA256 `7f74ccefe4a6447e639208c15b844ef60cfbaf3055f81640eb3f356fa2430f65`. It contains ledger, app database/immutable files, network configuration and protected TEST operator data. Treat it as private; never attach or publish it. It is an early checkpoint, not a current guarantee for later-created assets. Establish a reviewed rolling cold-backup procedure before relying on later state.

For a fresh backup, stop both writers first, record the interval, use a reviewed new archive destination and compute its exact hash. The existing cold-backup helper deliberately refuses overwriting its retained archive. Copying a live ledger/database with an unchecked file command is not accepted.

Restore into a **new isolated service and volume**, retaining the original live volume. The helper rejects the live service, populated unrecognized targets, wrong project/genesis and unverified archive hashes. Its archive inspector permits only bounded known Agave snapshot links and rejects traversal. Use private authenticated transport; never export an existing signer to an unapproved destination. Verify archive bytes before extraction.

The tested target is recovery-drill service `43fc867b-1105-423c-a901-84ec5cb9a46a`, volume `b3030354-8a36-4fed-939e-ea957fd65001`, https://recovery-drill-production.up.railway.app. Original extraction receipt and original seven-row verification remain preserved. Later isolated atomic tests added four assets; final-code reconfirmation must disclose them, not call this current copy pristine.

Compare genesis, known balances, mint bytes/supply/authorities, NFT holders, exact immutable URLs/bytes, original database rows and original faucet request UUID/signature. Replaying the UUID must not create another grant. Require advancing finalized slots. Do not cut over production or discard the source volume merely because the isolated copy starts.

## Frontend rollback

The previous verified0.6 deployment is `dpl_DmoMtTCGgJDeBzaeeEX1QhZA4TAV`, https://solana-classic-lqlaiisam-trenchfun1.vercel.app. A rollback changes only the branded alias. Inspect named deployment IDs and restore the current alias in a finally path. Verify anonymous HTML, executable assets, CSS and paper hashes after both stages, plus unchanged API runtime. Protected immutable deployment URLs do not establish anonymous branded access.

Never roll back during the accepted soak without recording interruption. Keep production and preview origins separate; do not broaden API CORS to every Vercel subdomain. Current rollback evidence records the exact observed stages.

## Incident handover

Preserve failed results, timestamps, signatures and deployment IDs. Record passed scope and missing evidence separately. Hardware-host control is Railway's responsibility; source publication, operating access and budget remain the founder's responsibility. Real SOC creation/acquisition, native supply, bridge custody/security and liquidity funding require the separate [founder packet](planning/SOC_LAUNCH_PACKET.md) and a concrete release decision.

## Bounded transaction history

The validator prunes older transaction history. At recovery reconfirmation, first available block72413 exceeded the initial restore verification slot11020, so the original grant could no longer be re-read from RPC. Its persisted confirmed UUID/signature, exact balance and no-double-grant replay remain verified, with historical finality retained in the original proof. Account state and original asset records remain available. Explorer lookup does not provide archival transaction indexing; preserve important signed receipts and evidence separately.

## Source-build migration

Read [the reviewed migration and rollback procedure](AGAVE_MIGRATION.md). The pinned source build, mixed-binary rollback rehearsal and volume-free runtime image checks are separate from canonical cutover acceptance. Keep the original stability run untouched until its actual final result passes.
