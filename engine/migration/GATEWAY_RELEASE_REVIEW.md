# Current gateway and public discovery review

The original frozen candidate now has three further individual requirements
reviewed: G5.01 protocol restrictions, G5.05 its exact browser-origin policy,
and G7.03 accessible public network/software information. This does not pass
the entire release or certify later branded transports through the old soak.

## Current protocol evidence

`gateway-review.mjs --ack protocol-only` accepts no caller-selected target. It
requires the original canonical genesis, API/validator boots, deployment,
source/core and Token-2022 pins. Its 25 actual checks use 28 requests, all below
public admission caps. No valid faucet grant, asset creation, usable signed
transaction, quota exhaustion or node-control request is sent.

The gateway refuses airdrop with empty parameters, non-allowlisted harmless
administrative/read methods, batches, caller-selected upstreams, malformed
envelopes, query limits, invalid/oversized transaction bytes and oversized
bodies. Exact origin, method/header lists and absence of credential permission
are checked for preflights. Unknown browser origins are refused, while
no-Origin requests remain subject to protocol admission. Destructive
`validatorExit` and `setLogFilter` rejection is tested only in the existing
in-process API regression, never against the live node.

The first audit correctly observed HTTP413 but failed its own wrong error-code
expectation. The frozen Fastify handler returns SERVICE_UNAVAILABLE for that
body-size error; the auditor was corrected without changing the service.
The failed report and exact executed source remain preserved. See
`evidence/gateway-current-individual-review.json` and its checksum-bound inputs.

## OPTIONS and installed software

Three additional OPTIONS-only requests to RPC, faucet and assets left observed
faucet, asset, gallery and persistent counter counts/totals unchanged. SQL
inspection used read-only mode and exported aggregate numbers only, never
rows, IPs, keys or credentials. The configured original backend origin list
contains only the frozen frontend; no preview origin is currently approved.

Installed validator and Token-2022 file hashes match the earlier reviewed
official releases. A provider control-plane TLS handshake failure is retained
separately; retry used the same bounded read with host verification enabled.
File hashes are observations of installed files, not independent attestation
of resident process memory or a consistent ledger/database backup.

See `evidence/gateway-options-and-software-current.json`. The branded developer
RPC/API transports intentionally have a separate permission policy. Their
production signing/custody acceptance is not inferred from these backend tests.

## Public discovery

`public-network-review.mjs --ack read-only` checks anonymous software manifests
against reviewed repository bytes, full Agave/Token-2022 revisions, artifacts
and Node/pnpm/SDK versions. Both network pages show the actual genesis,
single-operator limitation, valueless assets, reset policy and absence of
inherited Solana state/security. Home-to-network navigation works at1440/360px,
including the .net phone menu. No wallet is created or used. Screenshots are
outside source and deployments in `/tmp/soc-network-review-*.png`.

Manifests are anonymously accessible through public GitHub source; this review
does not claim new software-manifest buttons on the immutable original page.
See `evidence/public-network-individual-review.json`. Browser plugin was not
available, so project Playwright Chromium was used. Physical phones,
Safari/Firefox and comprehensive accessibility remain outside this check.

## Checks and remaining scope

Eight protocol-auditor guards, four software-manifest guards, 61 existing
in-process API/identity regressions and 28 roadmap checks pass. These test
counts are separate from the 25 actual production protocol checks.

```sh
node --test engine/migration/gateway-review.test.mjs \
  engine/migration/public-network-review.test.mjs
python3 scripts/pnpm.py exec vitest run \
  tests/integration/api.test.ts tests/unit/identity.test.ts
node engine/migration/gateway-review.mjs --ack protocol-only
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright-browsers \
  node engine/migration/public-network-review.mjs --ack read-only
```

Use pinned Node24. Reproduce remote probes only when new concerns justify it.
Failed results are never overwritten. The release checker remains nonzero:
G5 is2/12, G6 is7/11 and G7 is4/9 individually reviewed; other candidate-specific
reviews and operator handover remain pending. No current quota429, forged-IP,
concurrent admission, complete-storage, independent-validator or monetary
security acceptance is claimed. The original24-hour result, all41 frozen core
files, live validator and fixed deadline remain unchanged. Migration still
requires a maintenance decision, fresh consistent backup and its own new soak.
