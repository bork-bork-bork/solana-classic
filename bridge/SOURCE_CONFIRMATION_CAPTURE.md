# Initial private source-confirmation capture

`source-confirmation-capture.mjs` records finalized source transaction metadata
at the initial confirmation boundary, before later programme-account collection
or destination preparation can fail. It is a private rehearsal helper, with no
key creation, signing, submission, replacement, refund or retry interface.

Pass exactly `rpc`, `pins`, `transactionBase64`, `sourceEvent`,
`minimumContextSlot` and `evidenceDirectory`, with optional `timeoutMs`.
The transaction must be the original already-signed source deposit, retained
before its one original submission by the caller. Canonical base64, the1232byte
wire bound, all signatures, the selected programme, event account and deposit
opcode are checked before RPC or evidence writes. No source operation is sent.

## Capture order

1. Reserve a new empty real owned mode0700 evidence directory and selected
   signature/pins/event/original-byte hash before any request.
2. Check the selected private genesis. Read `getTransaction` once using
   finalized commitment, JSON encoding and supported version0. Persist its raw
   JSON text with exclusive mode0600, file fsync and directory fsync before
   parsing it or making later account queries. Null/invalid metadata remains
   retained and refuses continuation.
3. Read and persist signature status with `searchTransactionHistory: true`.
   It must report the same source slot, finalized success, null confirmations
   and no execution error. Confirmed-only, absent, failed or contradictory
   status refuses without a destination record. Check genesis again.
4. Use the existing bounded collector for two stable finalized programme sets,
   bracketed by current code/configuration observations at or after the source
   and status contexts. Run the existing signed source-economic verifier on the
   retained transaction and collected event snapshot. Its reconstructed signed
   bytes must match the originally selected transaction hash exactly.
5. Persist the completed private capture and source snapshot before returning.

At most14 read-only calls share one15second default deadline, configurable
from100ms to30seconds. Raw transaction/status responses are at most64KiB,
programme sets256KiB, code responses2MiB and total wire bytes8MiB. Redirects,
URL credentials/query paths, nonnumeric or implicit-port endpoints, public and
canonical genesi, changed code/counters and late/oversized responses refuse.
The monotonic deadline also covers synchronous verification and evidence work.

An initial response record uses schema2 and `minimumSelectedContextSlot`.
That checkpoint is not labeled as an observed code context. Existing history
readers keep their schema1 `firstCodeContextSlot` records unchanged. Raw native
number digits are preserved for exact fee, rent and movement verification.

## Preparation gateway

`captured-source-claim.mjs` exports
`prepareReviewedClaimWithSourceCapture({source, claim}, fetcher)` for future
private rehearsal callers. It captures source and claim inputs before awaiting
RPC. Evidence and journal directories must be owned mode0700, real and disjoint;
source/destination endpoints must be explicit numeric loopback and distinct.
Selected source pins must match the claim policy before capture.

Only after capture succeeds and its exact event hash/context match the claim
can the gateway invoke existing version3 reviewed preparation. The resulting
journal is `PREPARED`, attempts0, with no signed-byte handoff, signing, simulation
or broadcast. Destination expiry, code, mint, receipt and one-time handoff
checks remain the existing separate requirements. Capture does not make an
operation eligible for production settlement.

Existing preparation APIs and retained fixed-namespace runners are unchanged.
This is an opt-in new gateway, not a retroactive migration of old records or a
claim that every caller uses it. Never run an old completed runner to exercise
this path. A future actual source rehearsal needs a new admitted fixture and
exclusive namespace; it must not repeat old finalized operations or nonces.

## Scope and evidence

Sixteen synthetic and actual loopback HTTP groups cover both directions,
actual unused reviewed journal preparation, exact large balances, null history,
confirmed-only/failed/wrong-slot/contradictory statuses, later collection and
storage failure, changed code/genesis/counters/economics, source-byte tampering,
caller mutation, cross-event binding, unsafe endpoints, directory reuse,
redirects, slow streams and synchronous deadline overrun. Nine storage groups
include the initial-context schema and killed-process retention behavior.

These tests use synthetic transactions and test journals, not the retained
native-return operation or an actual new Agave source submission. The
[local result](../evidence/bridge-source-confirmation-capture-local.json) does
not recover the missing history. The [retained native investigation](SOURCE_BLOCK_HISTORY.md)
still needs strict offline blockstore/archive inspection on a suitable host.
Independent finality/inclusion, historical code, complete history, funded
backing/custody, security, mainnet and bridge acceptance remain false.

Callers must retain the original signed source receipt and unresolved source
obligation if capture fails. An absent destination record does not authorize
another deposit, a replacement nonce, refund or resubmission. Storage assumes
a trusted owner/host and is not encrypted. Keep raw captures, signed records,
keys and journal directories out of source, browser inputs and deployments.
