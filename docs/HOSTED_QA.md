# Hosted browser soak

The dedicated `browser-soak-qa` Railway service runs a readiness process continuously. A healthy `/health` means its process and Chromium started. `/api/qa` reports whether the exact reviewed candidate can start. Neither endpoint is a passed soak. The process starts no transaction workload until an operator stages an explicit activation matching the candidate freeze SHA-256.

Project: `356bcb0b-49c4-4bd3-bf10-bff7db8f33fe`. Production environment: `3367b373-2332-4702-8cce-c12b8f03949e`. QA service: `5225cb9c-16af-4ec2-863e-a02f1c199fb3`. Dedicated volume: `afbbcf7a-456c-4e47-b8a9-ea41e09bb549`, mounted at `/data`. The provider supplies a 50,000 MB capacity ceiling; the new filesystem initially occupied about 7.8 MB and stores only QA evidence/control and its TEST key. Resource limits are 2 CPUs and 2,000,000,000 bytes RAM, one replica, no sleeping and restart policy `NEVER`. The QA service uses no validator ledger, runtime database, public faucet repetition, or production-value assets. Its sanitized [readiness endpoint](https://browser-soak-qa-production.up.railway.app/api/qa) is available after deployment.

## Image and source inventory

Build with `infra/RailwayQA.Dockerfile`. It pins Linux Node `24.19.0` by image digest, installs pnpm `10.34.7` and the lockfile with `--frozen-lockfile`, checks installed Playwright `1.64.0`, then installs Chromium and Linux dependencies using the installed package's official `playwright install --with-deps chromium` command. The browser directory is `/app/.tools/playwright-browsers`, matching `scripts/soak.ts`. [Playwright browser installation documentation](https://playwright.dev/docs/browsers).

Upload from a separate sanitized directory. Include only public project source needed by the Dockerfile: the root package/lock/workspace/TypeScript files, `apps`, `packages`, `scripts`, `config`, `infra`, dependency manifest, sprint clock and planning documents. Exclude every symlink, hidden credential directory, `.data`, `.tools`, `ledger`, dependencies, build output, environment files, logs and raw runtime data. Record each uploaded file's SHA-256 in `evidence/hosted-soak-readiness.json`. Never upload the workspace itself with gitignore disabled. Set `RAILWAY_DOCKERFILE_PATH=infra/RailwayQA.Dockerfile` only on the QA service.

Freeze after the final executable changes. Include the QA Dockerfile and launcher in `candidate-freeze.json` core checksums. Rebuild QA from that same source inventory if any frozen source changes. The launcher checks existing freeze/core hashes; it never regenerates a freeze or substitutes the deployed source hash.

## Protected inputs

`/data/inputs` contains regular public JSON files copied byte-for-byte into regular `/app/evidence` files at readiness time:

- `candidate-freeze.json`
- `load.json`, `backup-check.json`, `restart-check.json`
- `pilot-agent-one.json`, `pilot-agent-two.json`
- `monitoring-config.json`, `frontend-rollback.json`, `remote-negative-controls.json`

Each proof must actually pass and bind to the complete same remote candidate and genesis. The five load/recovery/pilot proofs must finish before the fixed H72. The full 24 hours must fit before the original H144. Missing or mismatched proofs keep readiness blocked. Staging a generic proof from an older candidate cannot satisfy these checks.

The repaired candidate's `backup-check.json` records an actual final-code state reconfirmation of the existing isolated restored copy at `2026-10-13T16:01:06.171Z`. The original cold creation/extraction proof remains unchanged in `backup-check-initial.json`; no new archive was created or extracted. The new check recovered all seven original registry rows/files and four recorded mint states, explicitly enumerated the four later TEST asset additions, and reconciled the same original faucet UUID without another grant. Old transaction RPC history is unavailable: the earliest retained block was `72413`, newer than the initial proof's finalized slot `11020`. The original actual finality proof is retained, and the current confirmed database receipt and exact balance were checked. The failed first reconfirmation and the qualified verifier are preserved; this evidence does not claim complete historical transaction retention or a pristine restored dataset.

The TEST SDK funding actor lives in `/data/keys/soak-funder.json`. On 13 October a new, initially unfunded TEST-only key was generated directly inside the dedicated QA container after `testInputs()` verified the canonical remote experimental genesis. Its public address is `4fkQqsc2C7jDF9yFxMQJ4ydWRy9HFRTFLfsyGSdSaXT5`; its public creation proof is `/data/evidence/qa-funder-public.json`. Only the public address left the server. Fund that address with one TEST transfer from the existing local actor, keeping the existing actor's secret local.

Automatic approval review rejected exporting the existing local key to the QA volume because that specific credential export lacked explicit authorization. The completed server-side generation is a separate action; the rejection was not bypassed. Authenticated Railway SFTP can stage a protected TEST key file if an operator separately authorizes that exact export, but no existing key has been uploaded for this deployment. Never put key material in a service variable, image, browser storage, command argument or public evidence; never print its contents. Every operation must use the exact QA project/environment/service selectors above.

The service creates `/data/keys`, `/data/control` and `/app/.data` with mode `0700`. The generated key is a regular file, mode `0600`, one hard link, owned by runner UID `0`. The launcher copies it into the regular protected `/app/.data/soak-funder.json` file without logging contents; `.data` is never a symlink. It verifies the isolated remote genesis, funder identity and at least `5.1 TEST` before readiness. The local source actor was funded with `6 TEST`; check the separate hosted actor's balance against the frozen candidate before activation.

The browser creates its own fresh wallet through the production UI and keeps its signer only in memory. The SDK actor transfers `5 TEST` to that public address. The browser never imports the SDK key. A reload or process interruption destroys the browser signer and invalidates the uninterrupted run.

## Explicit activation and persistence

Do not stage activation until the reviewed candidate, actual prerequisites and QA source inventory match. Prepare a regular private JSON file locally containing:

```json
{
  "action": "start-24h-soak",
  "freezeSha256": "SHA256_OF_THE_EXACT_REVIEWED_CANDIDATE_FREEZE_FILE",
  "approvedAt": "OPERATOR_APPROVAL_UTC_AFTER_FROZEN_AT"
}
```

Upload it privately to `/data/control/start.json` and set mode `0600`. This is the explicit start action. The launcher atomically claims `/data/control/attempt.json` before spawning the unchanged soak script. An existing attempt blocks all restart/redeployment replay, even when the previous process died. Never delete this record to hide an interrupted run. Archive an interrupted attempt and its evidence only after review, resolve its defect, freeze a new candidate where required, restage valid proofs and explicitly approve the new attempt. An entire new continuous 24 hours is required.

Only generated `/app/evidence/soak.json` and `soak-progress.json` are file symlinks to `/data/evidence`; therefore their writes land directly on the persistent volume. Freeze/prerequisite files and the evidence directory remain regular because the source validators reject symlinks. The readiness report is atomically written directly to `/data/evidence/hosted-soak-readiness.json`. Download persistent output as regular local files before running offline release review. The two initial output placeholders `{}` have no passed status and supply no proof.

The actual soak performs 288 mint/transfer browser journeys at five-minute intervals, observes the frozen runtime/frontend every 30 seconds, rejects unexpected faucet calls and source/restart changes, and accepts only its full uninterrupted 24-hour result. `ready-awaiting-activation`, partial progress and a deployment marked successful are not release acceptance. Avoid changing API, validator, frozen frontend, QA image or recovery controls during the run.

Use one replica, no sleeping/serverless mode and enough CPU/memory for Chromium. Configure `/health` as the deployment healthcheck and explicitly set `PORT=3000` to match the public domain target; Railway's injected default was `8080` before this explicit override. The active repaired readiness deployment is `69bb0517-9ada-4b7c-a5fa-af837034003b`, built from source commit `35f0eaf1dede45452c9cdf9e6403669e966c427d`, runtime core SHA-256 `30697f3e9b441b05a036d0704b42322d723b3998840ed43d88b18a0d7ef7d1dd`. Its running deployment instance is `863f6824-7d96-4523-a002-3539f7135cec`. Chromium `156.0.8078.4` (revision `1248`) launched successfully with pinned Playwright `1.64.0` and Node `24.19.0`.

The repaired public source inventory is retained at `/data/evidence/qa-source-inventory-35f0eaf.json`: 79 uploaded files, 75 copied into the image verified unchanged; `.dockerignore` and three Agave/Token release manifests are build-context-only files for this QA image. The earlier `c1a7` inventory and readiness evidence remain historical. Both `/data/keys/load-wallets.json` and `/data/keys/soak-funder.json` survived the repaired deployment as regular `0600` files owned by UID `0`; no contents were read or exported by the source attestation. An actual deployed SDK check against official mainnet/devnet RPCs fetched only `getGenesisHash`, then rejected each full public hash even when expected and actual matched. Its proof is `evidence/genesis-public-guard-repaired.json`; no wallet or transaction was created. This repaired guard requires a new candidate freeze and current acceptance evidence before activation.

A killed runner must remain interrupted rather than automatically resume. Observe `/api/qa`, Railway deployment status and `/data/evidence`; do not infer completion from a container that stayed healthy.

## Active repaired candidate run

All eight reviewed current-candidate prerequisites were staged byte-for-byte and passed the hosted readiness checks. The one-time activation approved freeze SHA-256 `de996a8ca58a9d12cf2b264ab86d4e6eab6a3230a779d250402918b288309b82` at `2026-10-13T16:47:16.438Z`. The actual browser run started at `2026-10-13T16:48:22.762Z`; its first mint/transfer/verified-owner journey finished at `16:48:50.433Z`. The earliest full 24-hour completion is `2026-10-14T16:48:22.762Z`. Startup, active readiness and exact proof checksums are retained in `evidence/hosted-soak-startup.json`, `hosted-soak-active-readiness.json` and `hosted-soak-reviewed-inputs.json`. A started process or completed early journey does not pass the soak.

The independent [read-only progress endpoint](https://browser-soak-qa-production-e64c.up.railway.app/api/progress) uses a separate Railway domain targeted at port `3001`; the original readiness domain stays on `3000`. The unfrozen helper `/app/.tools/soak-progress-reader.mjs` reads only the two fixed public output files, rejects symlinks and files above 1 MiB, validates the exact canonical genesis and complete candidate, and returns allowlisted fields. It has no mutation/control route, arbitrary file selection, key reads or wallet/transaction arrays. POST, arbitrary paths and query parameters return 404. It runs detached without changing or restarting the frozen launcher, active browser, API or frontend. Actual process/host identity continuity, all 41 unchanged frozen files and route controls are recorded in `evidence/soak-progress-reader-verification.json`; its public source is `evidence/soak-progress-reader.mjs`.

The endpoint's top-level `at` is the reader response time. `progress.at` is the actual evidence timestamp and advances after each five-minute browser journey; the 30-second observer runs between those publications. Bind the expected `progress.startedAt` and any final `result.startedAt` to `2026-10-13T16:48:22.762Z` as well as the candidate/genesis/freeze, and never infer fresh observations from the response timestamp. `result` remains null until the actual runner writes a terminal result. Accept only a matching passed result with a full duration and complete journey count after ordinary offline release review. A reader failure says nothing about acceptance; inspect the preserved runner evidence without restarting it.
