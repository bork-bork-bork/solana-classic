# Solana Classic

An open-source, independent SVM experiment focused on memes and NFTs: a browser playground, verified gallery, transaction explorer, restricted RPC gateway and live release roadmap.

- Website: https://solana-classic-soc.vercel.app
- Live roadmap: https://solana-classic-soc.vercel.app/roadmap
- Whitepaper: https://solana-classic-soc.vercel.app/whitepaper.pdf
- Source: https://github.com/solana-classic/solana-classic
- Blockchain engine: https://github.com/solana-classic/solana-classic/tree/main/engine/agave

## Current scope

The deployed network is an experimental devnet with one project-operated validator and a fresh independent genesis. It does not inherit Solana balances or history. Its native TEST units are being branded **tSOC** in the presentation layer; they have no monetary value or promised conversion to SOC. The playground display patch is prepared for the next presentation deployment after the active stability test.

SOC token launch, native mainnet and the proposed reserve-backed 1:1 bridge are separate future releases. No real-money token or bridge is deployed by this repository today.

Active hosted runtime: official Agave3.0.14 and official Token-2022v10.0.0. Full pinned commits, hashes and the retained earlier compatibility-probe failures are documented in docs/COMPATIBILITY.md and the release manifests. Exact Node/pnpm/dependency versions are pinned in package.json and pnpm-lock.yaml.

The repaired bounded load passed200/200 operations within15seconds, with p95confirmed3.150seconds. This is an application workload, not chainwide capacity. The uninterrupted24hourbrowser test started13October2026 at16:48:22.762UTC. The live roadmap reports actual progress; elapsed time never automatically approves a release. Remaining final regression and individual release attestations are recorded separately.

## Source layout

The full blockchain engine source is included in [engine/agave](engine/agave) in this repository. A normal clone includes it; no submodule initialization or separate engine checkout is required. It is an unmodified Git subtree source snapshot of [anza-xyz/agave](https://github.com/anza-xyz/agave) v3.0.14, upstream commit `f516a8927c76c07f0ebc54ca7a4ce8b2046eee86`, matching the current experimental runtime. All 2,215 files, executable bits, licenses and upstream notices are retained. The imported tree SHA is `a4c75a1781d4ca56e7325a39d0614e1faa26030d`; provenance is recorded in [engine/upstream.json](engine/upstream.json). The snapshot is squashed, with upstream history accessible through the recorded upstream commit; our existing project history remains intact.

The active deployment still installs checksum-verified official upstream release binaries. Including source does not replace those binaries, change consensus, or establish a tested build from this repository. A future source build or engine change requires separate build provenance, compatibility checks and network acceptance before deployment; the running stability candidate remains unchanged. Engine source is excluded from application deployment uploads, and is outside the pnpm application workspaces.

| Directory | Purpose |
| --- | --- |
| engine/agave | Full pinned Agave validator, runtime, SVM, CLI, tests and build source (Apache 2.0) |
| apps/web | React playground, gallery, explorer and disclosures |
| apps/api | Fastify gateway, durable faucet accounting and immutable assets |
| packages/chain | Identity guards, transaction builders and receipt verification |
| packages/config | Shared schemas, limits and network contracts |
| roadmap | Read-only live status page and bounded public-source aggregator |
| infra and scripts | Pinned installation, hosting, recovery and verification tools |
| tests | Unit, integration and browser checks |
| docs and evidence | Whitepaper, runbooks, version manifests and scoped results |

## Development

Use Node24 and pnpm10.34.7. Install dependencies with `pnpm install --frozen-lockfile`. Bootstrap your own local validator using the pinned installers and compatibility guidance; hosted ledger data and private actors are never part of the source checkout. The public configuration is an identity reference, not permission to mutate a public Solana chain.

```sh
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
node --test roadmap/lib/status.test.mjs
```

For local application startup and hosting, follow CONTRIBUTING.md, docs/CONTRACTS.md, docs/COMPATIBILITY.md and docs/OPERATIONS.md. Do not silently regenerate a hosted ledger or substitute a local genesis into a hosted release proof. Local or mocked tests cannot certify remote behavior.

For engine development, use `engine/agave/README.md`, the pinned Rust version in `engine/agave/ci/rust-version.sh`, and its source-build documentation. Cargo dependencies and operating-system build prerequisites are still required. Preserve upstream licenses, attribute modifications, and review every future subtree update against its exact upstream commit and tree. Source import verification is not a Rust build or engine test result.

## Deployment and roadmap routing

The main frontend is hosted on Vercel. The gateway, SQLite, content-addressed assets and validator use persistent Railway storage. The read-only roadmap is served at the main site's `/roadmap` path using project-level CDN rules, so updating its status UI does not redeploy the frozen playground. Asset and live-JSON requests stay under `/roadmap/`; the aggregator reads only six fixed public status endpoints and accepts no user-selected upstream URL.

The separate `agave-source-build` Railway worker compiles our pinned engine source in an immutable Linux Rust 1.86.0 image, with two Cargo jobs, release thin LTO, 4 vCPUs, 16 GB RAM and its own persistent volume. It runs upstream SVM/genesis unit tests, then actual native, meme-token and NFT actions, process restart and cold backup/restore on its own fresh staging ledger. The [roadmap](https://solana-classic-soc.vercel.app/roadmap) reads its bounded [progress feed](https://agave-source-build-production.up.railway.app/api/build). Build completion is not cutover approval or a replacement stability result.

Worker implementation and pinned image digests are in `engine/build/`. `package-worker.py` packages committed source into a fresh ignored upload context; `worker_test.py` checks public-state redaction and network admission boundaries. A normal worker restart cannot replay an existing attempt: cache, diagnostics and attempt records stay on its private volume, and an interrupted run requires review. Public ingress exposes health/progress only; the staging RPC is loopback and uses disposable test actors. No main validator, QA runner, operator keys or existing ledger is used by this worker. Preserve prior attempts before any reviewed replacement run. Never redeploy the running compiler merely to update its progress UI.

During an active stability run, executable files, origin/configuration, process identity and served app hashes remain frozen. Read docs/HOSTED_QA.md and the current release evidence before making operational changes. New presentation/nav links are prepared separately and receive targeted verification at their next deployment.

## License and contributions

Original project material is under the MIT license in LICENSE. The imported engine/agave subtree remains under its upstream Apache 2.0 license and supplied notices; the root MIT license does not relicense it. Dependencies, upstream runtime distributions and fonts retain their own licenses; preserve THIRD_PARTY_NOTICES.md and the supplied upstream notices. The npm workspace packages are marked private to prevent accidental npm publication; that does not restrict this repository's MIT source license.

See CONTRIBUTING.md for changes and SECURITY.md for private vulnerability reporting. Runtime data, key files, hosting credentials, local tools and `.env` files stay ignored and are not source-release inputs. Historical evidence keeps its actual version, date, scope and original test-unit wording.
