# Private read-only Explorer adapter

The user explicitly approved this additional read-only process alongside the
unchanged validator during the active stability run. Approval and original
API/validator identities are recorded in `evidence/chain-reader-approved.json`.
It adds read load and process state; it does not restart the API or validator,
change their frozen source, sign transactions or write ledger data.

The adapter binds private port 3002; the public Railway service ingress remains
port 3000. The separate image-assets service relays its two named read routes
through the custom-domain frontend. No broad Railway credentials are deployed.

Each page checks the canonical experimental genesis. The fixed loopback RPC
supports only getGenesisHash, getSlot, getFirstAvailableBlock, getBlocks,
getBlock and getSignaturesForAddress. Responses, concurrency, block scans,
page size, cursor shape and cache entries are bounded. Calls cannot choose an
upstream or submit a transaction. Lists include validator votes and other
transactions from finalized retained blocks. The node prunes block history;
this service cannot provide transactions that have already been removed.

The helper source is installed at `/tmp/solana-classic-block-reader.mjs` in the
existing network-release container, using the pinned Node runtime. It is a
transitional adapter and must be reinstalled or incorporated into the reviewed
next deployment after that container is replaced. Never stop other node,
validator or QA processes when updating it. Match its exact script argument and
prior source digest before replacing only this helper.

Local checks: pinned Node24 `--test infra/explorer/block-reader.test.mjs`.
Adversarial tests verify public-genesis rejection, read-only methods, cursor
bounds, all transaction types, non-overlapping pagination and address history.
Live checks verify actual canonical genesis and finalized receipts separately
from the original frozen-candidate soak.
