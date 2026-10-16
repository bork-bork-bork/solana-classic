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

The optional collector below adds bounded observations. Actual private-ledger
compatibility, independent history coverage and economic movement verification
remain required. Neither module accepts a live bridge, removes an existing
obligation or resolves any expired attempt. See [selected-journal accounting](PENDING_INVENTORY.md) and
[the production recovery draft](FINALITY_RECOVERY.md).


## Bounded private RPC collector

`program-account-collector.mjs` exports `collectReturnedProgramAccounts` and
`parseReturnedProgramAccounts`. The collector accepts exactly `rpc`, `pins`,
`minimumContextSlot` and optional `timeoutMs`. Use an explicit numeric loopback
HTTP(S) endpoint and port, separately reviewed programme pins, and a positive
finalized checkpoint from the selected isolated ledger. Known public and
canonical devnet genesi, zero identities, credentials and redirects refuse.
The checkpoint and pin selection remain the operator's responsibility.

Before collection, the existing code observer reads the selected genesis,
Loader-v3 programme, complete ProgrammeData and configuration twice. The
collector then requests two unfiltered `getProgramAccounts` sets with base64,
`withContext:true`, finalized commitment and nondecreasing `minContextSlot`.
The full normalized account sets must match, including native balances, data,
owners and addresses. Context slots may advance. A second code observer then
rechecks the same selected programme and policy, and its outstanding counter
must still match the returned configuration.

The [official RPC method](https://solana.com/docs/rpc/http/getprogramaccounts)
returns accounts owned by the selected programme. The collector sends neither
filters nor data slicing. It still cannot prove the server returned every
account. A malicious or incomplete server can return matching subsets; two
matching reads and code pins do not provide independent history or finality.
The explicit coordinated-omission regression demonstrates this limitation.

There are at most ten read-only requests per collection. One overall deadline
covers transport, streaming and parsing: default 15 seconds, configurable from
100 milliseconds to 30 seconds. The caller receives a timeout even if an
injected transport ignores cancellation. Actual HTTP streams are cancelled on
timeout. Responses require JSON content type; programme account replies are
bounded to 256 KiB each, code replies to 2 MiB each, and total wire bytes to
8 MiB. Larger sets refuse, so this is a small private-rehearsal collector, not
an unrestricted production indexer. Node24 raw JSON number tokens preserve
native u64 balances above floating-point precision before normalization.

The returned `snapshot` is private input to `reconcileEventInventory`; collect
both sides separately and obtain the original-token escrow through the reviewed
mint/asset observer. The collector does not read token escrow or journals and
does not prove simultaneous cross-chain snapshots. It writes no files and has
no keys, signing, submission, retry or refund interface. Keep account sets,
addresses, policies, balances and returned digests in protected rehearsal
storage rather than public evidence or frontend inputs.

Seventeen local test groups cover integration with both pending directions,
large raw balances, changed code/authority/policy/counters, malformed and stale
responses, schema and size bounds, a shared deadline, real loopback HTTP,
redirect refusal and slow streaming cancellation. All 197 related bridge
checks pass locally. These use synthetic RPC data; actual private Agave ledger
collection and comparison with retained same-history journals remain pending.
Every completeness, independent-history, backing, custody, settlement and
production permission remains false in the result.
