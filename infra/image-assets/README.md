# Uploaded artwork service

This separate Railway service stores images and metadata on its own `/data`
volume, with SQLite records binding each mint to an immutable content identity.
It reaches the existing testnet through the bounded public RPC gateway. It has
no validator, signing key, faucet authority or access to the main runtime volume.

Users can choose a still PNG or JPEG up to 1 MiB and 4,194,304 decoded pixels.
Sharp 0.35.5 decodes and re-encodes it to PNG, removes embedded metadata, and
resizes within 1024 × 1024 without enlargement. SVG, other formats, malformed
files and oversized inputs are rejected. Upload processing is serialized.

Artwork URLs and metadata are immutable for the retained testnet data. This is
project-operated hosting, not a promise of eternal storage. The original
testnet reset policy still applies. Caps: 512 MiB artwork storage, 200 new images
daily and 30 per upstream IP daily. The custom-domain adapter shares gateway IP
quotas; these are experimental limits, not production capacity claims.

The gallery admits an uploaded mint only after checking the canonical testnet
genesis, successful finalized Token-2022 issuance, supply and immutable on-chain
authorities/metadata. Existing preset creations remain in the combined gallery.
Uploads alone are not shown as minted assets.

Build context: `python3 infra/image-assets/package-context.py`. Deploy the
resulting `.tools/image-service-context` to the `image-assets` service. Set
`SC_IMAGE_ORIGIN` to its HTTPS Railway domain and mount a separate volume at
`/data`. It never changes or restarts the frozen gateway or validator.

Checks: `node --import tsx --test infra/image-assets/tests.ts` with pinned Node
24, plus `python3 scripts/pnpm.py exec tsc -p infra/image-assets/tsconfig.json`.
Local fixtures test decoding, bounds, origin rejection, wrong/public genesis,
immutable retry, metadata-image binding and storage surviving reopening.
Live browser tests separately verify uploaded NFT and meme issuance.

Before including this service in a mainnet release, add operator-managed
off-host backups, abuse handling and their own restore/security acceptance.
The existing frozen-candidate soak and backup results do not certify it.
