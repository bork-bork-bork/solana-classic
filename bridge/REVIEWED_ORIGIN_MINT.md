# Reviewed metadata-origin policy

`reviewed-origin-mint.mjs` prepares and checks a separate private observation
policy. It binds the complete selected bridge code/policy pins, Token-2022
code/authority pins, exact original supply and precision, and SHA256 of the
complete mint account. `observeReviewedOriginAssets` captures those expectations
before its first asynchronous read and requires the immutable self-metadata
layout. It then uses the existing two-snapshot, bridge/token-code-bracketed
observer. A different complete mint digest cannot inherit valid code admission.

This is preparation for future claim-journal integration. It does not change
`pending-claim.mjs`, grant a signed-byte handoff, sign, submit, write a journal,
retry, refund or authorize settlement. Existing plain-mint defaults remain.
All signing, retry, broadcast and production flags stay false.

## Selecting and retaining a policy

1. Independently select a private origin genesis and complete bridge/token-code
   pins. Public Solana chains and canonical Classic devnet are refused.
2. Independently review the original mint bytes and select their complete SHA256,
   exact positive u64 supply string and precision. The policy builder performs
   no RPC read and cannot establish the provenance of these inputs.
3. Call `reviewedOriginMintPolicy`, retain its domain-separated digest, then
   call `observeReviewedOriginAssets` with that policy and the retained finalized
   checkpoint. Unknown fields, malformed values, changed policy contents or
   code-chain mismatches reject. Mint bytes must match exactly.
4. Treat any change as requiring a fresh explicit review. A legitimate token burn
   changes supply and mint bytes too; this strict snapshot cannot silently
   accept it. No new journal semantics or automatic policy refresh is provided.

The digest is an integrity binding, not a signature, an independent review or
an authenticated production configuration. A caller can construct a different
self-consistent policy. Production storage, custody, approved signers and the
binding of a policy to an immutable claim record remain separate requirements.
An RPC's finalized snapshot does not establish independent consensus or
complete funded backing.

## Local verification

Eight new policy/integration checks plus62 related regressions pass locally.
They cover exact large supply, complete pin/digest binding, malformed or edited
policies, wrong public/canonical identities, changed metadata, mutable caller
input during awaits, strict metadata layout and preserved read-only boundaries.

```sh
node --test bridge/reviewed-origin-mint.test.mjs bridge/mint-metadata.test.mjs bridge/origin-assets.test.mjs bridge/origin-token-code.test.mjs bridge/pending-claim.test.mjs bridge/pending-redemption.test.mjs
python3 engine/rehearsal/reviewed_metadata_origin_test.py
```

The separate copied-ledger runner starts from the completed valueless metadata
origin. It selects its policy before startup, waits for the retained finalized
checkpoint, permits only read-only RPC requests, stops its copied process and
verifies the original ledger, input and transaction records stayed unchanged.
Its execution is a separate proof from the earlier metadata creation/lock
rehearsal. Neither proof enables metadata settlement or production redemption.

## Actual private-copy verification

Five actual checks pass on one fresh private origin-ledger copy. The selected
mint digest, supply/precision and complete bridge/token-code pins match;
a wrong selected digest or token-code pin refuses actual state. An edited
policy refuses before any RPC. Fresh review-bound observations retain exact
assets after the negative checks. The observer makes56 read-only RPC requests,
with zero simulations or broadcasts.

Three copy admission guards pass locally and on the private Linux worker. The
copied validator stops with SIGINT; the original complete ledger inventory,
fixture input, result and four transaction records remain unchanged. This is
read-only verification, not a new token creation, source lock, settlement,
crash/fork or full-validator consensus test. See
[the scoped result](../evidence/bridge-reviewed-metadata-origin-agave.json).
