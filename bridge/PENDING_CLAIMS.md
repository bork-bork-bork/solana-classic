# Private bridge-claim recovery journal

`pending-claim.mjs` implements native release and original-token redemption
in a private rehearsal workflow. It never creates keys, signs, broadcasts, requests a new blockhash
or builds a replacement transaction. Both RPCs must be explicit loopback
endpoints; known public chains and the live Classic devnet are refused.
This is not a production relayer or a signing/custody service.

## Interface

- `preparePendingClaim(...)` accepts one already signed legacy claim
  transaction and its independently selected expected event. It verifies all
  signatures, canonical bytes, the exact programme/instruction/accounts,
  chain identities, source event PDA and checkpoints. A receipt-derived ID
  makes the operation unique even if a caller tries to change message bytes.
  The first record is exclusive; existing records are never overwritten.
- `takeSubmissionAttempt(directory, id)` checks destination genesis, expiry,
  an absent receipt, configuration/precision/committee, and a fresh
  finalized source observation. It durably records the attempt **before**
  returning the existing signed bytes. It will not hand them out again.
- `reconcilePendingClaim(directory, id)` reads the same signature, finalized
  receipt and exact transaction. Finalization requires the recipient's native
  balance increase and reserve's decrease to match the event's exact converted
  amount. Original redemption instead requires exact escrow/recipient token
  debits/credits, matching mint/owner/programme/decimals metadata, and no hidden
  native movement in those vault/recipient accounts. Rechecking genesis and a nondecreasing destination checkpoint guards
  restart/endpoint replacement during observation.

Caller code is responsible for submitting only the returned bytes to the
returned private RPC, at most once. This module contains no broadcast method.
On-chain receipt protection remains necessary even with a journal. A caller
with custody can bypass a client tool; reviewed production controls must
address that authority and the integrity of durable storage.

The prototype restricts the rent/fee payer to an address separate from the
recipient and committee, uses exactly three distinct configured co-signers,
and accepts one claim instruction with no extra transfers. Original redemption
also requires a canonical Token-2022 recipient ATA, a plain 82-byte immutable
mint, and token accounts that are plain or carry only ImmutableOwner. Shared
payer accounting, versioned messages, extended mint metadata and extra
instructions are not supported by this journal yet.

## Durable state and uncertainty

The directory must be real/canonical and private (mode0700); records and locks
are mode0600. Writes use exclusive files, file fsync, atomic rename for updates
and directory fsync. An exclusive per-operation lock stops concurrent callers.
Signed bytes and raw journal files remain private; public summaries contain
only programme/receipt IDs, signature, hashes, state and attempt count.

If the client crashes after the attempt marker but before submission, that
operation is ambiguous. It must be reconciled; the API does not authorize a
fresh attempt merely because no signature is currently visible. Expiry alone
does not prove that an earlier transaction never landed. A consumed receipt
without the matching transaction's economic evidence is marked for review.
RPC failure or conflicting evidence preserves the current record. A known
finalized operation cannot silently regress to pending on a later RPC.

Stale `.lock` or `.new` files after a crash require operator review. First
establish exclusive ownership and preserve the record, then inspect the exact
signature/receipt; do not automatically clear files or reset the attempt state.
The tool is not an encrypted wallet. It holds no private signing keys, but
signed transaction bytes must still stay out of source and web deployments.

## Verification scope

```sh
node --test bridge/pending-claim.test.mjs bridge/pending-redemption.test.mjs
```

Twenty-three filesystem/transaction/RPC-fixture checks cover private persistence,
exact signatures and instructions, duplicate domains, public/soaking identity
guards, outage recovery, expiry, pruning, conflicts and economic reconciliation.
Fixtures do not establish two-chain finality or production readiness.

The separate `bridge/rehearsal/pending.mjs` and `engine/rehearsal/pending.py`
harness passed six actual private-ledger checks: a new synthetic source lock,
private prebroadcast journal, one native claim broadcast, actual destination
RPC outage/restart, original-signature economic reconciliation and matching
700,000-unit bridge counters. Its fault orchestrator deliberately waited for
chain finality while the client journal remained unconfirmed. This establishes
recovery of a landed pending operation, not unknown landing, an expired
transaction, a fork, a hard crash, independent operators or security review.
See [the exact uploaded source hashes and result](../evidence/bridge-pending-recovery.json).

The original-token redemption subsequently passed a separate six-check actual
private-ledger drill: one native return, one journaled redemption, actual
origin RPC outage/restart and same-signature/token-delta recovery. Escrow and
both counters reconcile at 600,000 origin units; the original user has 1,400,000
units. See [redemption evidence](../evidence/bridge-redemption-recovery.json).
Its fault harness also waited for finality before outage; unknown landing,
expiry/pruning and actual fork testing remain open. Earlier native evidence
retains its historical source hashes. Shared native regression tests pass.

RPC balance metadata must be safe JavaScript integers in this prototype.
Larger values are rejected; production needs lossless integer parsing. An
attempt count is a conservative no-resubmission marker, not a measurement of
network broadcasts. The actual rehearsal separately records its one broadcast.

Production still needs a durable signer/custody service,
programme code/upgrade-authority pins, independent source-transaction/backing
verification, crash-safe storage recovery, independent verifiers and review.
See [the finality policy draft](FINALITY_RECOVERY.md).
