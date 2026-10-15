# Immutable metadata-mint inspection and private observation

`inspectImmutableMint` is a pure byte inspector. It makes no RPC request,
accepts no key, reads no journal and cannot sign, submit or authorize a bridge
operation. It is preparation for [metadata admission review](https://github.com/solana-classic/solana-classic/issues/2).

The private read-only origin observer can explicitly select
`mintPolicy: "immutable-self-metadata-v1"`. Its default remains `plain`, which
rejects extended mints. Versions1/2 of the claim journal retain plain-mint
original-redemption admission. Explicit version3 now binds this narrow reviewed
metadata policy in a private prototype. A fresh two-chain Agave rehearsal now
verifies both metadata settlement directions and known-finalized restart
recovery. No bridge is enabled on mainnet or the public website. Successful inspection
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
both-direction journal regressions pass, for70checks total including the eight
reviewed-policy checks described below. Observer fixtures
use synthetic RPC responses, not a running ledger. The workflow requires no
production secrets or chain endpoint.

The observer retains exact selected supply/precision, a fixed165-byte escrow,
complete bridge and optional token-code pins, nonregressing finalized contexts
and identical asset bytes between reads. Metadata bytes are included in that
comparison. Other mint extensions and all escrow extensions remain refused.
See [the earlier scoped local result](../evidence/bridge-metadata-observer-local.json).

An actual415-byte public SOC mint snapshot requested with finalized commitment
also passes offline inspection. Its exact slot/data hash and read-only scope
are in [the inspection record](../evidence/bridge-metadata-inspection.json).
This is one selected RPC observation, not independent consensus verification.

Before live settlement admission: review the explicit version3 claim/redemption
admission, complete pending original-redemption and competing-fork checks,
retain negative controls and obtain independent security review. The earlier plain-mint ledger result does not verify this
metadata option. Issue2remains open for that wider work.

## Fresh private Agave origin

Seven actual checks now pass on one fresh source-built Agave3.0.14 ledger.
Four valueless fixture transactions create an immutable metadata mint, initialize
its bridge escrow, enable source locks and finalize one source lock. Settlement
stays paused. The observer verifies the actual metadata layout, exact supply,
escrow/counter equality and full bridge/Token-2022 code pins. The default plain
policy, wrong supply/precision and wrong complete token-code pin reject.

The observer makes65 read-only RPC requests. A fresh observation retains exact
asset bytes after the negative checks. The private validator stops with SIGINT;
no existing ledger is copied or opened and no settlement is broadcast. Four
local admission guards cover worker identity, isolated startup, public-chain
refusal and retaining an already-reserved attempt. Source hashes and exact
scope are in [the private-origin result](../evidence/bridge-metadata-origin-agave.json).

This is one synthetic origin and a read-only observer result. It does not
verify metadata settlement, a two-chain round trip, recovery, full-validator
consensus, funded backing or independent custody/security review. The private
fixture and its source obligation remain retained; never replay or reset it.

The separate [reviewed origin policy](REVIEWED_ORIGIN_MINT.md) now binds exact
selected mint bytes and original supply to complete code pins. Eight new local
checks and five actual read-only private-copy checks pass. This stricter
observation is separate from the new version3 private journal integration. Its
16 new local checks and145 combined regressions do not establish actual
metadata settlement or production admission by themselves. A later, separate
10-check actual two-chain/restart rehearsal is recorded in
[the metadata journal proof](../evidence/bridge-metadata-journal-agave.json).
See [journal scope](PENDING_CLAIMS.md).


A separate7-check actual metadata native-claim fault now verifies one original
signature/payout after destination SIGKILL before observed finality, with review
admissions retained and retry blocked. The original fixture stays unchanged.
This does not cover pending original redemption or a competing fork. See
[the scoped fault result](../evidence/bridge-metadata-pending-crash-agave.json).
