# Expired redemption: review and recovery draft

This is a policy draft, not a signer, relayer, approval or enabled recovery
transaction. Preserve the existing journal and its single submission attempt.
Expiry does not authorize a source refund, second deposit, new event nonce or
reset. The current takeSubmissionAttempt continues to refuse a second attempt.

## Observed private case

The V2 native return of10000original base units finalized, adding10000000native
units to reserve. Creating its297-byte event separately cost the sender2958000
native units in rent; sender debit was12958000. Network fee payer was separate.
This measured test-chain cost is not a production quote.

Original redemption was broadcast once; no signature status was observed before
the copied origin crash. After restart it expired without a finalized receipt
or token payout. The original signed journal remains EXPIRED_UNRESOLVED.

| Quantity | Original base units |
| --- | --- |
| Original escrow/outstanding counter | 1960000 |
| Native outstanding counter | 1950000 |
| Pending original redemption | 10000 |
| Recipient original-token account | 40000 |

Escrow equals native outstanding plus pending redemption. Keep that obligation;
do not set counters equal. Native reserve52000000/floor2000000 remain intact.
These are synthetic fixture balances, not complete funded mainnet backing.

## Required private review packet

1. Preserve receipt/operation ID, event hash, source signature/PDA/nonce,
   original destination signature/transaction hash, signed bytes and last-valid
   block height. Signed bytes remain private.
2. Re-observe both pinned genesi, programme bytes/upgrade authorities,
   configuration/epoch, mint/decimals, committee and pause/custody policy.
   Matching programme addresses alone are insufficient.
3. Independent source observers must verify the same successful finalized
   native return, exact event, reserve movement and counter. No new source event.
4. Independent destination operators must supply dated finalized contexts,
   actual heights beyond expiry, receipt observations and sufficient history
   coverage. Missing one-RPC data, elapsed time or a journal label cannot prove
   non-settlement. Reconcile any valid receipt/finalized payout; conflicting
   history/authorities/finalized views stop recovery and invoke reviewed pause.
5. Reconcile recipient/escrow movements and counters with the pending liability.
   Record a separate append-only operator decision, evidence hashes and approved
   independent quorum. Never overwrite the original attempt or invent success.

## Proposed future path, unimplemented

If independently reviewed and authorized, a future signer could prepare fresh
blockhash/signatures for the same economic event and receipt PDA. Amount,
recipient, mint, programmes, epoch and instruction bytes must remain identical.
Atomic consumed-receipt checks must prevent old and recovery transactions from
both paying. Code pins, source finality, custody and quorum remain mandatory.

Keep original history immutable and any separately authorized recovery attempt
append-only. This draft supplies no recovery signer, approval verifier or
broadcast. Before implementing or enabling it, test late receipt appearance,
concurrent old/recovery submissions, independent-node disagreement, upgrades,
epoch/pause/backing changes, duplicate approvals and signer/broadcast crashes.
Successful pending original-redemption recovery remains a separate positive
test to obtain. See the exact scope in the public rehearsal evidence.
