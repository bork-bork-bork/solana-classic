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
also requires a canonical Token-2022 recipient ATA and token accounts that are
plain or carry only ImmutableOwner. Versions1/2 admit only plain82-byte immutable
mints for original redemption. Explicit version3 adds the narrow reviewed
metadata policy described below. Shared payer accounting, versioned messages
and extra instructions remain unsupported.

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

RPC native balance metadata now uses raw JSON source digits and exact u64
BigInt balances in `lossless-native-rpc.mjs`; Node24 source support is mandatory. An
attempt count is a conservative no-resubmission marker, not a measurement of
network broadcasts. The actual rehearsal separately records its one broadcast.

Production still needs a durable signer/custody service,
enforced production programme/upgrade policy, independent source-transaction/backing
verification, crash-safe storage recovery, independent verifiers and review.
See [the finality policy draft](FINALITY_RECOVERY.md).

## Mandatory programme pins for new private claims

`preparePinnedPendingClaim(args)` prepares a version2 journal. Supply
`programmePins: {source, destination}` with each exact reviewed pin schema
from `program-pins.mjs`. Both sides must bind the signed event's chains,
programmes, bridge, direction and original mint. Canonical policy bytes are
domain-separated and hashed before the first exclusive, fsynced write.
This is a new private rehearsal API, not an approved production configuration.

`takePinnedSubmissionAttempt(directory,id)` refuses legacy records. For
version2 records, the older `takeSubmissionAttempt` entry also enforces pins;
choosing that entry cannot skip the committed policy. Historical version1
rehearsals remain readable through their original interface. They do not gain
pin acceptance retrospectively, and cannot declare unenforced pin metadata.

While holding the receipt lock, handoff checks both deployed programmes twice
before source-event admission and twice afterward. Each observer verifies the
derived loader-v3 ProgrammeData pointer, complete account hash, exact ELF and
zero unused capacity, explicit upgrade authority or immutability, and static
bridge configuration hash. Epoch, decimals, settlement pause and the full
five-key committee must agree with the signed claim and both sides. Receipt,
configuration, original-token account and source-event reads use nonregressing
finalized checkpoints. Finalized block height and absent receipt are checked
again before recording the single attempt and returning existing signed bytes.
The journal saves only public observation metadata alongside its private signed
bytes. This module still cannot sign, replace a transaction or broadcast.

The original preparation checkpoint is retained separately from later recovery
checkpoints. Advancing recovery does not invalidate the saved admission.
An expiry observed before any handoff remains inspectable with no fabricated
pin admission and cannot authorize a new attempt. Failed admission preserves
the original journal bytes. Eighteen new synthetic filesystem/transaction/RPC
tests cover both directions, late upgrades/policy changes, expiry, receipts,
concurrency, input/record corruption and later reconciliation. With previous
journal/parser/pin/review regressions, 82 checks pass locally. No new Agave
handoff or real bridge transaction was executed for this integration.

These checks bind the code observed at handoff time. They cannot prove the
source event was originally executed by that code or stop an authorized
upgrade after the last observation. A local writer with journal access or a
signer with custody can bypass client controls; the policy hash is not a
signature authenticating durable storage. Production needs reviewed immutable
deployment or upgrade custody, signing enforcement, authenticated operators,
independent history/backing verification and external security review. The
combined pinned-journal path still needs its own private-ledger drill. Earlier
standalone real programme-pin and crash results keep their historical hashes.
Future private uploads of `pending-claim.mjs` must also include its sibling
`claim-pin-policy.mjs`, `program-pins.mjs`, `sdk.mjs` and
`lossless-native-rpc.mjs`, with every uploaded dependency hash recorded. Do
not patch retained passed attempt directories to update their dependencies.

```sh
node --test bridge/pinned-pending.test.mjs bridge/program-pins.test.mjs \
  bridge/pending-claim.test.mjs bridge/pending-redemption.test.mjs \
  bridge/pending-large-native.test.mjs bridge/lossless-native-rpc.test.mjs \
  bridge/observer-reports.test.mjs bridge/expired-review.test.mjs
```

## Exact large-native RPC metadata

The journal now reads `getTransaction` native balances from original JSON
decimal digits using Node24 reviver source support and checked u64 BigInt.
Values above Number precision, including the u64 maximum, remain exact.
Canonical nonnegative integer numeric tokens and exact signed-account counts
are required; fractional/exponent/string/null/overflow metadata rejects.
Other finality/expiry fields retain the existing safe-number guards.

Thirty-three checks pass: five parser, five large-balance journal scenarios
(including actual loopback HTTP with synthetic replies), and 23 original
two-direction regressions. A one-unit incorrect delta above Number precision
cannot finalize or reset a submission attempt. No new real-ledger claim or
reconciliation is claimed; previous private rehearsal evidence retains its
historical source hashes. Include `lossless-native-rpc.mjs` in future private
journal uploads. See `evidence/bridge-lossless-native-metadata.json`.


## Real-ledger exact-metadata journal verification

Ten checks now pass on fresh cold copies of the stopped V1 ledgers and copies
of both retained finalized journals. The current client reconciles the original
native claim and original-token redemption signatures, signed bytes, receipts
and economic deltas. Actual fee-payer metadata around 499999997000000000 native
base units stays exact. A one-unit altered native balance rejects in each
direction; journal bytes stay unchanged and another handoff remains forbidden.
Zero broadcasts, no new signed transactions, both copied validators stopped.
Original stopped-ledger inventories and original journals remain unchanged.

The first attempt returned no native transaction history and stopped admission;
its copied processes were shut down. A separate fresh attempt returned both
original transactions. This does not establish permanent pruning, exercise a
real competing fork or test unknown landing. Existing local missing-history
guards still apply. See `evidence/bridge-retained-journal-reconciliation.json`
for actual source hashes, signatures and scope; 33 client and nine worker/copy
checks also pass. Preserve both private attempt roots, never replay/reset them.
Production custody/code pins, independent finality/backing and security review
remain separate release gates.


## V2 claim crash before observed finality

Seven checks pass on new private ledger copies with one new synthetic
10000-origin-unit lock (nonce4) and one journaled native-claim broadcast.
Immediately afterward, the fault harness observed the claim confirmed at
slot690 while the finalized root was659, then killed only the pinned copied
destination process with SIGKILL (actual exit-9). It did not wait for claim
finality. The client journal remained submission-attempted during the outage,
kept its original signed bytes/signature and refused another handoff.

After same-genesis restart, the original claim finalized. Current exact-u64
metadata verifies the transaction and10000000-native-unit payout; both
counters and source escrow equal1960000, original user40000. The reserve
is42000000 native units with its2000000 floor and bootstrap record unchanged.
All three copied process starts stopped; original cold-restored ledgers and
fixture input remain unchanged. Nine worker/copy guards and33 journal/parser
regressions pass. See `evidence/bridge-v2-pending-crash.json`.

This adds a pre-finality native-claim process-crash case to the earlier
known-finalized drills. It does not test original-redemption pending faults,
a competing fork or physical host failure. The runner's expired-unresolved
branch was not exercised: this attempt recovered FINALIZED. Hypothetical
budget/global-backing gates remain false, and independent custody/verifiers,
code pins, full validators and security review remain required. Preserve
`/data/bridge-v2-pending-crash-v1`; never rerun/reset it. Future drills need
new copies and new nonces.


## V2 original-redemption crash: actual expiry guard

Seven actual checks pass on new V2 copies after one native return and one
original redemption broadcast. No withdrawal signature status was observed
before copied-origin SIGKILL(-9), with processed944/finalized913. After
same-genesis restart the original withdrawal remained EXPIRED_UNRESOLVED:
no token payout, second handoff, replacement, refund or counter reset. This
is a passed expiry guard, not successful redemption recovery. Its finalized
branch was not exercised. See `evidence/bridge-v2-redemption-crash-expiry.json`
and `bridge/EXPIRED_RECOVERY.md` for unimplemented manual recovery policy.

Escrow/counter1960000 equals native outstanding1950000 plus pending original
redemption10000; original user40000, native reserve52000000/floor2000000.
Bootstrap record unchanged. All3copy starts stopped; original ledgers/input
and prior native journal unchanged. 33journal/parser+4worker+6copy checks
pass; all41frozen hashes match. Source return10000000 credits reserve;
event rent2958000 separately raises sender debit to12958000, with a separate
network fee payer. This is synthetic-chain rent, not a production fee quote.

First v1 attempt failed an assertion omitting that rent after one source
return, before any withdrawal broadcast. It is preserved/stopped with nonce5.
Passed `/data/bridge-v2-redemption-crash-v2` uses nonce6 on NEW copies of the
previous native-settlement baseline. Never replay/reset either attempt or
reuse nonces5/6. Successful pending original redemption, actual competing
forks, custody/code pins, independent verification, funded complete backing
and security review remain release gates.


## Actual combined pinned-journal integration

Eight checks now pass on fresh private source-built Agave copies. Two source
events and two pinned-journal settlements finalized, with exact native release
and original-token redemption. Six deliberately wrong expected code/authority/
policy pins refused handoff against real accounts and preserved prepared
records/economics. Both original signatures reconcile once; later checkpoints
retain admission metadata and repeated handoffs refuse. Final escrow/counters
1950000, original user50000, reserve52000000 and floor2000000 return to the
selected baseline, with bootstrap record unchanged. Both copies stopped and
original ledger/input/journal hashes match. Three worker and six copy guards
also pass. See `evidence/bridge-pinned-journal-agave.json`.

The first attempt refused a checkpoint-bound RPC request before any broadcast.
Its two processes stopped, zero-transaction outcome and executed source are
preserved. Fresh v2 waits for finalized roots to reach the retained pin
checkpoints; no checkpoint was lowered. Preserve both attempt roots. This
known-finalized functional round trip does not test an actual code upgrade,
new crash/fork, physical power loss or production custody. Complete funded
backing, independent operators/verifiers and security review remain open.


## Isolated authority-change admission rehearsal

`rehearsal/authority-change.mjs` and
`../engine/rehearsal/authority_change.py` prepare a separate, fresh copy of the
stopped V2 synthetic ledgers. They preserve the original ledgers and journals.
The runner admits the retained finalized checkpoints and exact historical
programme pins before creating one new source lock with unused nonce10.

A version2 native-claim journal is prepared before either authority changes.
The native programme authority is then changed with Loader-v3's checked
instruction, signed by both old and new fixture authorities. The same process
is repeated for the source programme. Each change must finalize and alter only
the authority bytes in ProgramData: the executable and its remaining bytes
must stay identical. The old reviewed pins must refuse observation and claim
handoff, while the prepared journal, receipt absence, escrow, counters, reserve
and bootstrap record remain unchanged. No settlement is broadcast. The pending
source-lock liability remains recorded rather than being refunded or erased.

This runner does not rotate production authorities, upgrade programme code,
retry a retained event, or approve new pins after a change. Fixture authority
keys stay on the private worker. Both copied validators must stop and original
cold inventories, fixture and finalized journal hashes must still match before
exporting a passed result. Execution results are recorded separately; source
and local guards alone do not establish an actual authority-change result.


Seven actual private-ledger checks now pass. Both checked authority rotations
finalized, and each blocked the original prepared claim without changing its
journal or bridge economics. There was one new synthetic source lock, two
authority-change broadcasts and zero settlement broadcasts. Both copied
validators stopped; original ledger, fixture and finalized journal hashes
match. The10000-origin-unit pending liability is retained. See
[the actual result](../evidence/bridge-authority-change-agave.json).
This adds actual authority-change coverage to the earlier wrong-expected-pin
tests. Programme-code upgrades, competing forks, independent operators,
production custody and complete funded backing remain separate requirements.


## Version3 reviewed metadata claim records

`prepareReviewedPendingClaim(args)` requires both `programmePins` and a separately
selected `reviewedMintPolicy`. It binds exact mint bytes, original supply and
precision, complete origin bridge policy/code and Token-2022 code/authority
pins to the signed event before exclusively writing a version3 record. The
older preparation APIs refuse this new option rather than silently ignoring it.
No old record is upgraded or retrospectively granted metadata admission.

`takeReviewedSubmissionAttempt(directory,id)` requires version3. All three
handoff entry points enforce its retained review. Before returning the existing
signed bytes once, the journal observes the original mint/escrow/counters twice,
with complete code checks and nonregressing finalized contexts on the correct
chain. Selected mint bytes and supply must match, escrow must cover outstanding
obligations, and obligations must cover the claim. Original-redemption recipient
and authority checks remain in force. Final programme observations bracket the
mint checks, followed by late expiry, receipt and genesis checks.

A compact admission record is persisted with the single-attempt marker. Missing
or altered policy/admission data refuses inspection. Expiry, outage, missing
history and receipts cannot authorize another attempt. An exact finalized
transaction found without this reviewed handoff is retained as
`CONSUMED_REVIEW_REQUIRED`, rather than finalized as reviewed settlement.

16 new synthetic filesystem/transaction/RPC checks cover both directions,
changed metadata/token code, depleted escrow, old-entry bypass attempts,
policy mutation, record tampering, recipient controls, concurrency and recovery
states. Together with existing journal, code-pin, expiry-review and exact-balance
regressions,145 JavaScript checks pass. Seven existing worker guards also pass.
The socket-based regression uses an actual loopback HTTP server with synthetic
responses. These checks do not execute a new Agave metadata settlement or crash.
See [the scoped local result](../evidence/bridge-reviewed-journal-local.json).

This remains a private prototype. The policy digest is integrity binding, not
authentication. Trusted durable storage, approved custody/signers, independent
history/finality/backing verification and external security review remain
required. Actual two-chain metadata settlement and known-finalized restart
recovery are recorded separately below; further fault testing remains pending.
Earlier read-only and plain-mint proofs retain their original scope and hashes.
Future private uploads must include every transitive metadata/policy observer
dependency and record its exact hash. Never patch a retained attempt to update it.

```sh
node --test bridge/reviewed-pending.test.mjs bridge/pinned-pending.test.mjs
```


## Fresh metadata settlement and restart harness

`rehearsal/metadata-journal.mjs` with
`../engine/rehearsal/metadata_journal.py` prepares two fresh private, loopback-only
source-built ledgers. It creates one immutable synthetic metadata mint, selects
complete genesis code pins, and runs one version3 lock/native-release/return/
original-redemption round trip. Wrong selected mint digest and token-code pins
must refuse handoff in both directions while retaining journal/economic state.

Each signed setup/source transaction is retained privately before its sole
submission attempt; claim bytes are handed out through the existing journal.
The harness reconciles finalized signatures before stopping each destination
in turn. With that RPC unavailable, reconciliation must fail without changing
the saved record or allowing retry. Same-ledger restart must verify the original
signature, receipt, review admission and exact economic deltas again. This is
known-finalized restart recovery, not a pre-finality crash or fork test.

The driver reserves the attempt before generating disposable keys. Each client
phase has an exclusive durable marker; existing results and phases cannot be
replayed. Both processes must stop. Four local guards verify worker identity,
new-ledger/restart command separation, finalized readiness and retained-attempt
refusal. Execution results are recorded separately; source/guards alone do not
establish actual settlement, recovery or production readiness.


Ten actual checks now pass on two fresh source-built Agave3.0.14 private ledgers.
The immutable metadata mint and setup finalize, followed by one source lock,
one version3 native release, one native return and one version3 original-token
redemption. Four wrong reviewed-mint/token-code handoffs refuse against actual
accounts without changing prepared journals or bridge economics.

Each finalized journal survives an actual destination RPC outage unchanged;
same-genesis restart then reconciles its original signature, receipt, exact
movements and retained review admission. Another handoff remains forbidden.
Tracked escrow, both counters, original token balance, native reserve and floor
return to their initial values. User event rent and payer fees are separate
from those bridge-accounting checks. All four process starts stop with SIGINT;
application-level graceful flushing is not claimed. Four worker guards pass
locally and on Linux. See [aggregate evidence](../evidence/bridge-metadata-journal-agave.json).

This known-finalized restart result does not verify a metadata claim interrupted
before finality, a competing fork, physical host loss, independent operators,
complete genesis backing or production custody/security. No previous private
ledger or journal was opened, reset or replayed. Private keys, signatures,
policies, balances and raw ledgers stay out of this public evidence.
