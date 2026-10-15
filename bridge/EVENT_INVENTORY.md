# Returned source-event and receipt accounting

`event-inventory.mjs` derives obligations from supplied programme accounts,
without trusting a selected journal's state label. It is an offline verifier:
no RPC collection, keys, signing, journal access, storage, retry or settlement.
Keep returned event/receipt identities and snapshot digests private.

Call `reconcileEventInventory` with:

- `pins:{origin,native}`: independently selected programme-pin objects accepted
  by the existing pin policy. Both sides must select one isolated bridge,
  matching remote chains/programmes, mint and orientation.
- `originSnapshot` and `nativeSnapshot`: exact objects containing `genesis`,
  `program`, `commitment:'finalized'`, `contextSlot` and `accounts`.
- Each account has exactly `address`, `owner`, `executable`, `lamports` as a
  canonical u64 decimal string and `dataBase64` as canonical base64.
- `originEscrowUnits`: the separately supplied exact original-token escrow.
  The programme-owned account set does not include the Token-2022 escrow.
- `minimumContextSlots`: two explicit positive safe integer checkpoints.

Each supplied set contains two to 256 accounts from one selected programme and
bridge instance. The derived configuration and V2 vault must be present. Static
configuration bytes match their selected policy hash and identities, precision,
committee, quorum, epoch and limits. Accounts must have the selected owner and
be non-executable. Duplicate addresses, unsupported layouts, extra fields,
noncanonical encoding, unsafe slots and stale labelled contexts refuse.

Source events must have the exact direction/domain/epoch and derived PDA,
nonzero sender, representable native amount and source slot within the supplied
context. Each consumed receipt has its derived PDA and stores an exact source
event from the opposite supplied set. Orphan/conflicting receipts refuse.

For this zero-bootstrap model, exact integer arithmetic derives:

```text
origin outstanding = original lock events - consumed original redemptions
native outstanding = consumed native claims - native return events
pending native claims = original locks without native receipts
pending original redemptions = native returns without original receipts
origin outstanding = native outstanding + both pending directions
```

The derived outstanding counters must match both supplied configurations.
Escrow must cover origin outstanding; any surplus stays separate. The returned
native vault must cover its stored floor plus pending native payouts. Lifetime
recycled gross flows may exceed u64; each event conversion and current liability
must fit u64. Amounts never pass through floating point.

Bootstrap records refuse explicitly. Applying this model to a preloaded native
allocation requires the separate funded genesis/bootstrap inventory and a
reviewed extension. Unknown account types and other bridge instances also
refuse rather than silently disappearing from the calculation.

Account ordering is canonical. The output includes domain-separated input/result
hashes, both flow totals and pending obligations. These hashes bind the supplied
bytes, not their origin or completeness. No RPC endpoint, signature, signed
transaction or private key is returned.

## Limits and verification

Eleven synthetic offline test groups cover both directions, omission against
unchanged counters, orphan/altered receipts, domain/epoch/PDA/slot/policy errors,
reserve and escrow coverage, exact large and recycled amounts, bounded schemas
and deterministic ordering. They also demonstrate the unresolved limitation:
omitting an event while coordinating the supplied counters can still satisfy
the model. An RPC returning a selected subset is not independent history proof.

`rpcResponseCompletenessVerified`, `completeSourceEventInventoryVerified`,
`sameLedgerHistoryVerified`, `simultaneousSnapshotVerified`,
`finalizedCommitmentIndependentlyVerified`, `freshChainStateVerified`,
`deployedCodeAndCustodyVerified`, `sourceEconomicMovementsIndependentlyVerified`
and `backingVerified` remain false. All retry/refund/reset/sign/broadcast/
settlement/production permissions remain false.

A future collector needs bounded, pinned fresh observations, independent
history coverage and economic movement verification. This module does not
accept a live bridge, remove an existing obligation or resolve any expired
attempt. See [selected-journal accounting](PENDING_INVENTORY.md) and
[the production recovery draft](FINALITY_RECOVERY.md).
