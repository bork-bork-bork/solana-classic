# Finality and recovery policy draft

This is a reviewable production policy draft, not an activated bridge. The
prototype relies on a 3-of-5 transaction-signing committee. Three dishonest
members can authorize a false event; a committee outage can stop redemption.
RPC checks and replay receipts do not remove those trust assumptions.

## What a verifier must bind before signing

Each independent verifier needs its own source-chain observation and a pinned
release manifest: both genesi, both programme IDs and code hashes, upgrade
authorities, bridge/configuration epoch, mint, decimals, allowed extensions,
committee identities, caps and pause/custody policy. The current observer
checks an event's owner, PDA and fields; it does not yet implement every one
of these production manifest checks.

A verifier must independently check:

1. The source RPC still identifies the expected chain before and after the
   read. A changed chain or old recovery context stops the observation.
2. The event is available at finalized commitment, with a context at least as
   new as the retained same-genesis checkpoint and the event's source slot.
3. The event belongs to the approved source programme and has the derived PDA,
   exact sender/nonce, direction, recipient, amount, epoch and destination.
   Independently verify the successful source transaction and economic escrow
   or reserve movement; an RPC's event response alone is insufficient.
4. Approved programme code and authorities have not changed. A programme owner
   check alone cannot rule out malicious code installed at the same address.
5. The destination receipt is absent for a new settlement. If it already
   exists, verify its contents and economic effect and reconcile the existing
   operation rather than submit a replacement.

Configured members must be separate operators, with reviewed keys and recovery
procedures. Five keys held by one project are not five independent verifiers.
The two-chain rehearsal's keys remain synthetic local co-signers.

## Operation states

| State | Allowed next action | Required retained evidence |
| --- | --- | --- |
| Source submitted | Poll the same signature | Original signed bytes, signature, blockhash/expiry and intended event |
| Source uncertain | Reconcile that signature and event; stop settlement | No new nonce or replacement deposit while ambiguous |
| Source finalized | Independent observers validate the exact event | Source identity, finalized context, event bytes and transaction |
| Attestation prepared | Review destination and required authorities | Exact message hash, epoch, recipient and amount |
| Destination submitted | Poll the same signature and receipt | Signed bytes written privately before first broadcast |
| Destination uncertain | Reconcile receipt, transaction and balances | No second economic operation or fresh signatures on an altered message |
| Destination finalized | Check counters and actual escrow/reserve movement | Receipt, transfer and exact integer-unit reconciliation |

Private signer records must never be uploaded into the frontend or public
evidence. Public evidence contains only addresses, hashes, contexts and receipts.
The existing prototype integration harness is not a production relayer.
The private native-release journal now implements durable signed bytes, a
single attempt handoff and same-receipt/economic reconciliation; origin-side
redemption and the full production signer/custody workflow remain open.

## Failure handling

**RPC outage or lag:** return no settlement observation. Keep the operation
pending; recover against the same genesis and retained checkpoint. Do not
lower the checkpoint simply because a restarted RPC is behind. Do not accept
an old cached event as fresh signing approval. The observer implements these
admission guards; independent verification and signer orchestration remain work.

**Process restart:** check genesis, approved code, event accounts, claim receipts,
balances and counters before resuming. Existing finalized claims must still
reject replay. Controlled SIGINT recovery on private test-validator ledgers is
a narrower result than a full-validator crash, machine outage or cold restore.

**Pre-finalized source fork:** do not attest an unfinalized event. A processed
or confirmed event disappearing is not a finalized deposit. The required test
must use an actual competing private fork; fixtures cannot pass this gate.

**Conflict involving supposedly finalized state:** stop new attestations and
invoke the reviewed committee emergency pause procedure. Preserve observations
from independent nodes and compare the escrow/reserve backing before recovery.
Do not silently rewind a checkpoint, change genesis, clear consumed receipts,
mint replacement units or unlock source escrow after native units were released.
Resolve any backing shortfall explicitly with reviewed governance and published
accounting; a client retry cannot repair an economic inconsistency.

**Committee/upgrade-key compromise:** use the separately reviewed custody and
pause process. Caps bound some exposure; they do not make compromised quorum
signatures trustworthy. Verifier replacement, epoch changes, upgrade timelocks,
emergency authority and independent review remain production decisions.

## Still required before production

- Durable signer custody and origin-redemption journals; native-release
  pending recovery has a private six-check result, not production acceptance.
- Actual pre-finalized fork and unknown-landing/expiry/pruning recovery drills.
- Cold restore, SIGKILL/machine outage and full-validator recovery checks.
- Independently operated verifiers/RPCs, code/authority pinning and monitoring.
- Exact backed bootstrap, custody/emergency policy and independent review.

See [the implementation and gate matrix](../docs/planning/MAINNET_BRIDGE.md),
[bridge code](program/src/lib.rs), [event/domain validation](program/src/state.rs)
and [the local observer](sdk.mjs). No monetary activation is authorized here.
