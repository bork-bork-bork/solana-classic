# Immutable metadata-mint inspection and private observation

`inspectImmutableMint` is a pure byte inspector. It makes no RPC request,
accepts no key, reads no journal and cannot sign, submit or authorize a bridge
operation. It is preparation for [metadata admission review](https://github.com/solana-classic/solana-classic/issues/2).

The private read-only origin observer can explicitly select
`mintPolicy: "immutable-self-metadata-v1"`. Its default remains `plain`, which
rejects extended mints. The claim journal still rejects extended mints. Nothing
is wired into settlement, mainnet or the public website. Successful inspection
does not establish origin backing, reserve custody, independent finality or
production readiness.

## Selected layout

Input is a Buffer of at most4096bytes and a canonical nonzero mint address.
An initialized unextended82-byte mint is accepted only with no mint/freeze
authority and precision no greater than9. Supply remains an exact u64 string.

The extended policy accepts only the pair MetadataPointer(type18) and
TokenMetadata(type19). It requires zero mint padding, the mint account-type
byte, exact TLV lengths, unique supported types, an immutable self-pointing
metadata pointer, no metadata update authority and metadata bound to the
selected mint. Other extensions, including transfer fees, transfer hooks,
permanent delegates, scaled balances and pausing, are refused.

Strings are strict UTF-8 with byte bounds: name256, symbol32, URI2048,
additional keys128 and values512. At most8additional fields are admitted;
duplicate keys, truncated data and trailing bytes are rejected. Metadata URIs
are decoded as text and never fetched. The policy intentionally rejects valid
Token-2022 layouts outside this narrow selection, including spare TLV padding.
It is stricter than the current on-chain prototype's extension allowlist.

The caller must separately verify account owner/executable status, chain
identity, source freshness, selected supply, escrow/control, complete token and
bridge code pins and all settlement rules. This inspector cannot supply those
guarantees. Do not treat metadata labels as proof of token identity or authorship.

## Verification

```sh
node --test bridge/mint-metadata.test.mjs bridge/origin-assets.test.mjs bridge/origin-token-code.test.mjs bridge/pending-claim.test.mjs bridge/pending-redemption.test.mjs
```

12 decoder checks use the existing pinned SPL Token0.4.15 and Token Metadata0.1.6
SDKs as serialization/decoding oracles. Seven new observer checks exercise
explicit selection, unchanged defaults, authority/layout refusals, changing
metadata, chain restrictions and token-code bracketing. Related observer and
both-direction journal regressions pass, for62checks total. Observer fixtures
use synthetic RPC responses, not a running ledger. The workflow requires no
production secrets or chain endpoint.

The observer retains exact selected supply/precision, a fixed165-byte escrow,
complete bridge and optional token-code pins, nonregressing finalized contexts
and identical asset bytes between reads. Metadata bytes are included in that
comparison. Other mint extensions and all escrow extensions remain refused.
See [the scoped local result](../evidence/bridge-metadata-observer-local.json).

An actual415-byte public SOC mint snapshot requested with finalized commitment
also passes offline inspection. Its exact slot/data hash and read-only scope
are in [the inspection record](../evidence/bridge-metadata-inspection.json).
This is one selected RPC observation, not independent consensus verification.

Before settlement admission: review this explicit observation policy, update
claim/redemption admission consistently, exercise actual valueless
metadata-bearing mint/escrow layouts, retain negative controls and obtain
independent security review. The earlier plain-mint ledger result does not
verify this metadata option. Issue2remains open for that wider work.
