# Solana Classic

An open-source, independent SVM experiment focused on memes and NFTs: a browser playground, verified gallery, transaction explorer, restricted RPC gateway and live release roadmap.

- Website: https://solana-classic-soc.vercel.app
- Live roadmap: https://solana-classic-soc.vercel.app/roadmap
- Whitepaper: https://solana-classic-soc.vercel.app/whitepaper.pdf

## Current scope

The deployed network is an experimental devnet with one project-operated validator and a fresh independent genesis. It does not inherit Solana balances or history. Its native TEST units are being branded **tSOC** in the presentation layer; they have no monetary value or promised conversion to SOC. The playground display patch is prepared for the next presentation deployment after the active stability test.

SOC token launch, native mainnet and the proposed reserve-backed 1:1 bridge are separate future releases. No real-money token or bridge is deployed by this repository today.

Active hosted runtime: official Agave3.0.14 and official Token-2022v10.0.0. Full pinned commits, hashes and the retained earlier compatibility-probe failures are documented in docs/COMPATIBILITY.md and the release manifests. Exact Node/pnpm/dependency versions are pinned in package.json and pnpm-lock.yaml.

The repaired bounded load passed200/200 operations within15seconds, with p95confirmed3.150seconds. This is an application workload, not chainwide capacity. The uninterrupted24hourbrowser test started13October2026 at16:48:22.762UTC. The live roadmap reports actual progress; elapsed time never automatically approves a release. Remaining final regression and individual release attestations are recorded separately.

## Source layout

| Directory | Purpose |
| --- | --- |
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

## Deployment and roadmap routing

The main frontend is hosted on Vercel. The gateway, SQLite, content-addressed assets and validator use persistent Railway storage. The read-only roadmap is served at the main site's `/roadmap` path using project-level CDN rules, so updating its status UI does not redeploy the frozen playground. Asset and live-JSON requests stay under `/roadmap/`; the aggregator reads only five fixed public status endpoints and accepts no user-selected upstream URL.

During an active stability run, executable files, origin/configuration, process identity and served app hashes remain frozen. Read docs/HOSTED_QA.md and the current release evidence before making operational changes. New presentation/nav links are prepared separately and receive targeted verification at their next deployment.

## License and contributions

Original project material is under the MIT license in LICENSE. Dependencies, upstream runtime distributions and fonts retain their own licenses; preserve THIRD_PARTY_NOTICES.md and the supplied upstream notices. The npm workspace packages are marked private to prevent accidental npm publication; that does not restrict this repository's MIT source license.

See CONTRIBUTING.md for changes and SECURITY.md for private vulnerability reporting. Runtime data, key files, hosting credentials, local tools and `.env` files stay ignored and are not source-release inputs. Historical evidence keeps its actual version, date, scope and original test-unit wording.
