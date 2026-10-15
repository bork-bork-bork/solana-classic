# Mainnet and redemption bridge implementation

Development started 14 October 2026 alongside the frozen testnet's stability
run. The founder authorized coding and roadmap publication. This authorizes an
isolated implementation, not a monetary launch, token purchase or production
bridge activation. The original testnet deadline and ledger are unchanged.

## First implementation

`mainnet/plan.mjs` validates a draft genesis budget and validator configuration.
It uses integer base units, rejects inflation and unbacked bootstrap allocation,
and leaves deployment disabled. Actual genesis compilation, account-by-account
supply reconciliation and multi-validator consensus tests follow.

`bridge/program` implements one SVM program with two configurations:

- On the origin chain, immutable Token-2022 SOC is locked in a PDA-controlled
  token account. Mint/freeze authority, transfer fees/hooks, permanent delegates
  and unsupported extensions are rejected. A successful lock creates an
  immutable source event with sender, recipient, amount, nonce, chain/program
  identities and configuration epoch.
- On Classic, a program-owned native reserve releases native units for an
  attested origin lock. It transfers existing native units; it does not mint a
  second SPL token or create unbacked units. Returns move native units back into
  that reserve and create a return event. Attesting that finalized return
  permits the matching original units to leave escrow.

The prototype fixes native precision at nine decimals. Origin precision comes
from the configured, verified mint. Amounts are canonical origin base units,
converted with checked integer arithmetic. Fees and rent are separate; native
returns must use a representable amount. Transfer and daily settlement caps,
rent-preserving reserve limits, immutable replay receipts, quorum pause controls
and failed-transaction rollback are implemented.

The bridge starts paused. Initialization is restricted to the program's current
upgrade authority. No single-member escrow withdrawal instruction exists.
However, the development program remains upgradeable: production requires a
reviewed upgrade authority, governance and timelock/immutability decision.

## Verification model to review

The initial implementation is **committee-attested, not trustless**: three of
five distinct configured transaction signers authorize settlement. Accounts,
amounts, recipient, direction, source event, both network identities, both
programs and epoch are bound to the message. Duplicate signer accounts cannot
increase the quorum. A committee quorum can lie about source events; a
committee outage can prevent redemption. Caps reduce bounded loss but do not
remove that trust. No independent verifier operators have been appointed.

`bridge/sdk.mjs` supplies the event codec, an unsigned native-claim instruction
and a read-only loopback observer. The observer checks a pinned fresh genesis,
finalized event-account ownership, the source PDA and account context. It
refuses the currently soaking testnet and known public chains. It never signs
or broadcasts. A fixture-based observer test is not real cross-chain finality.

## Implementation sequence and evidence

| Milestone | Work | Evidence required |
| --- | --- | --- |
| M1 Genesis planner | Exact supply, backing and validator argument drafts | Invalid allocation/precision/identity tests; deployment remains disabled |
| B1 Bridge core | Escrow, native reserve, receipts, conversion, quorum and pause | SBF compilation plus successful and malicious local SVM transactions |
| W1 Wallet prototype | One test session, native transfers, receipts and gallery | Local desktop/mobile and signing/identity regression; mocked scope labelled |
| M2 Genesis and validators | Source-built `solana-genesis`, fresh private validator set, verified genesis | Account-by-account monetary totals, stake/fee/burn behavior, independent node identities |
| B2 Two-chain integration | Two fresh isolated Agave ledgers, observer and co-signer workflow | Finalized lock/release/return/unlock; outages, reorg/fork policy, replay and partial failure recovery |
| B3 Backed bootstrap | Account for prelocked SOC, reserve, validator/stake funding and every genesis account | Initial counters reconcile to finalized backing; no genesis bypass or double-counting |
| W2 Unified testnet app | Wallet session shared by studio, gallery and transfers | Reviewed origin permissions; live valueless test journeys; owned assets verified independently |
| R1 Production security | Mainnet operators, custody, upgrades, signers, monitoring and external review | Independent review, recovery/emergency drills, reviewed release configuration |
| R2 Activation | Actual original mint, mainnet genesis and explicit release decision | Published addresses, supply, custody, reserves, fees, launch disclosures and funded operations |

M1/B1/W1 are prototype milestones. Passing them does not pass M2/B2/B3/R1/R2,
and this work does not inherit the old testnet stability result. No mainnet or
redemption date is promised. The next engineering target is M2 and B2, while
the current testnet completes its separate acceptance process.

## Unresolved production decisions

The real SOC mint/supply, founder acquisition and holdings, native bootstrap
backing and amounts, reserve initialization, validator operators/incentives,
fee/burn behavior, custody, verifier identities, upgrade controls, pause/recovery
policy and independent review must be specified before activation. Prototype
configuration is not an approved production monetary policy.

An especially important gate is bootstrap accounting: the native bridge begins
with zero outstanding and must apply verified initial backing before monetary
activation. A separate V2 one-time bootstrap now passes local SBF tests, but
genesis allocations cannot rely on the unbootstrapped state. Production remains
blocked until every initial native balance is backed, origin escrow is finalized
and both bridge counters reconcile to the actual initial state.

The current testnet, its tSOC balances and experimental NFTs do not gain a
mainnet conversion or allocation through this implementation.

## Primary technical sources

- [Checked token transfers](https://solana.com/docs/tokens/basics/transfer-tokens)
- [Token-2022 extensions and transfer behavior](https://www.solana-program.com/docs/token-2022/extensions)
- [Pinned Agave genesis CLI source](https://github.com/solana-classic/solana-classic/blob/main/engine/agave/genesis/src/main.rs)
- [Official Token-2022 v10 release](https://github.com/solana-program/token-2022/releases/tag/program%40v10.0.0)

Keep provider-specific deployment details in operator documentation. Public
status separates code, local proof, live integration and production readiness.

## 14 October integration checkpoint

The bridge completed a finalized synthetic round trip on two fresh, private,
source-built Agave 3.0.14 ledgers, with 13 checks and matching escrow/counters.
Invalid transactions were rejected in RPC simulation; successful settlements
were broadcast and finalized. Three local keys co-signed, not independent
verifier operators. RPC recovery, fork policy and backed bootstrap remain open.
See `evidence/bridge-two-chain-rehearsal.json`.

Pinned `solana-genesis` compiled and all 249 actual genesis accounts reconcile
to the synthetic budget. Full-validator startup is blocked on the current host
by its 524,288 open-file ceiling, below Agave's required 1,000,000. No consensus
or runtime-supply acceptance is claimed. See `docs/planning/VALIDATOR_HOST_GATE.md`
and `evidence/mainnet-validator-rehearsal.json`.

The unified wallet passes 14 unit and 17 mocked browser scenarios; public
custom-domain verification is recorded separately. Builder and collector pages
are part of that same public frontend. These are devnet applications.

## Observer recovery preparation

The observer now rechecks genesis after reading a finalized event and refuses
state older than its supplied recovery checkpoint. Thirteen SDK/recovery tests
pass, including actual loopback HTTP failures/recovery against synthetic
responses. This is client admission evidence, not a new two-Agave-ledger result
or proof of fork choice. The previous two-chain integration evidence retains
its original source hashes; actual ledger restart/fork drills remain open.

A new read-only devnet account continuity tool verifies the deployed custom
programme, upgraded bytecode and both counter states. Its current finalized
sample is not a stopped-writer backup or cutover acceptance. Follow
`engine/migration/DEVELOPER_CONTINUITY.md` before any reviewed migration.

## Actual private-ledger recovery checkpoint

Seven checks now pass against the retained, source-built private Agave ledgers.
Each actual RPC outage returns no source observation. Both SIGINT process
restarts preserve finalized events, receipts, exact account bytes/balances and
600,000 origin-unit outstanding counters. Native-release and original-redemption
replays still fail in actual compiled-bridge simulations; no new broadcasts.
All rehearsal processes stopped. A private cold archive was retained before
reopening, but no cold restore or application-level graceful flush is claimed.

See `evidence/bridge-ledger-recovery.json` and the reviewed source hashes there.
This extends client recovery evidence; pending-operation settlement, actual
fork/reorg policy, hard-crash/cold-restore tests and independent finality remain
open. `bridge/FINALITY_RECOVERY.md` makes those verifier responsibilities,
same-receipt recovery states and emergency-policy decisions explicit as a draft.

## Pending native-settlement checkpoint

`bridge/pending-claim.mjs` implements private signed-byte persistence, a single
submission handoff, identity/configuration admission and same-signature,
receipt and exact economic reconciliation. Fifteen unit checks pass. The
module does not sign, broadcast, obtain fresh blockhashes or access public
chains; origin-redemption and production custody remain separate work.

Six actual private-ledger checks passed with one new synthetic source lock and
one native claim broadcast. Client confirmation was withheld through an actual
destination RPC outage/restart; the journal then verified the original
finalized signature/receipt/bytes and exact 100,000,000 native base-unit transfer.
Both counters reconcile at 700,000 origin units. The independent fault harness
waited for finality before interrupting RPC: this is a landed-pending-operation
case, not an unknown-landing, expiration, fork or hard-crash result. All three
private processes stopped, with archive/keys/raw journals retained privately.
See `evidence/bridge-pending-recovery.json` and `bridge/PENDING_CLAIMS.md`.

## Original-token pending redemption checkpoint

The shared journal now covers both bridge directions with 23 unit checks and
five SDK checks. Original redemption verifies configured mint/precision,
immutable mint and safe recipient/escrow token authorities, the canonical
recipient ATA and exact token debit/credit metadata; unrelated native movement
is rejected. Extended mint metadata remains unsupported in this client.

Six actual private-ledger checks passed after a new synthetic native return:
one original redemption was journaled and broadcast, confirmation withheld
through origin RPC outage/restart, then its original signature/receipt and
100,000-unit token movement reconciled. Both counters and escrow now 600,000;
original user 1,400,000 units. All three private processes stopped. The fault
harness waited for finality; this is not unknown landing, a fork or production
redemption. See `evidence/bridge-redemption-recovery.json`.

## Exact bootstrap accounting checkpoint

The new offline `mainnet/bootstrap.mjs` auditor counts all 249 retained actual
genesis accounts and reconciles declared original/native units. It includes
protected reserve rent, exact precision slack, reserve tranches and proposed
initial bridge counters. Thirteen bootstrap and seven planner checks pass.
The planner now also checks any declared protected reserve budget.

For the hypothetical six-decimal source budget used with this inventory,
330,310,570 original base units cover the allocations and eight-byte vault
rent; 880 native base units remain as precision slack. Source mint/supply/escrow
are hypothetical and unfunded. Matching input counters do not set anything
on-chain. Current zero-initialization is flagged as a failed bootstrap gate.

See `mainnet/BOOTSTRAP.md` and `evidence/mainnet-bootstrap-accounting.json`.
Finalized backing, enforceable reserve custody, one-time bootstrap event
consumption, actual counter initialization, full-validator consensus and
independent review remain required. No genesis/runtime or monetary activation
was performed by this accounting work.

## One-time bootstrap local checkpoint

The new V2 SBF build records a committee-attested bootstrap lock without moving
native funds, consumes its normal settlement receipt, sets the native counter
and enforces a protected reserve floor. Ten Rust unit tests, nine compiled-SBF
runtime scenarios and five unsigned-client checks pass. Counter/receipt replay,
bad budgets/domains, wrong authority, insufficient quorum, under-rent backing,
partial-write rollback and old vault ABI rejection are covered.

The native source budget/inventory in these tests is synthetic and injected;
this is not a complete genesis or new Agave-ledger proof. The 16-byte V2 vault
is incompatible with old eight-byte rehearsal vaults. Previous binaries,
private ledgers and historical evidence remain preserved. Actual custody
transition, funded finalized backing, independent source verification,
full-validator consensus and security review still block B3/R1/R2. See
`bridge/BOOTSTRAP.md` and `evidence/bridge-bootstrap-local.json`.

## Fresh Agave execution evidence

Fourteen checks now pass on two new private source-built Agave3.0.14 ledgers.
Deployed V2 bytes/authority, immutable source lock, bootstrap without payout,
receipt/counter initialization, replay/quorum/bad-budget/floor rejection and
subsequent return/redemption are verified. Both processes stopped. Three
worker boundary checks pass. See
`evidence/bridge-bootstrap-agave-rehearsal.json`.

The native attested budget is a hypothetical projection, not a complete
test-validator inventory: exact observed global supply exceeds that budget.
This is deliberate isolated program testing and demonstrates why a committee
attestation alone cannot establish genesis backing. Actual inventory, funded
escrow, custody, full-validator consensus and independent review remain gates.
No previous private fixture was upgraded; no canonical network changed.

## V2 cold archive extraction and restore

`engine/rehearsal/cold_restore.py`, `cold_copy.py` and
`bridge/rehearsal/cold-restore.mjs` now pass eight actual worker checks. A new
private working copy establishes the finalized baseline, stops, and becomes a
410,562,560-byte archive. The archive is extracted and copied into separate
restored ledgers; four snapshot links are rebased to absolute paths inside
those ledgers. No original V2 ledger is opened by a validator.

All 20 selected bridge accounts retain exact bytes, owners, balances and
programme authorities, including bootstrap record/floor, both counters, escrow
and consumed receipts. Same-genesis finalized observation survives restore.
Four actual RPC simulations reject settlement replays, an altered bootstrap
recipient and a second bootstrap; all leave state unchanged. Zero broadcasts.

Six copy/archive boundary tests and three worker guards pass. The bounded
extractor checks paths, types, link ancestry, duplicate members and size before
creating the destination, writes owner-only files before symlinks, and refuses
external links or writes below a link. It does not use unrestricted extraction.
Original cold inventory hashes remain unchanged. At each startup, Linux fd/maps
samples verify the copied processes have no forbidden original/working ledger
paths open; this is not continuous host auditing. All four copy processes stop
with recorded SIGINT exits; application flushing, power loss and forks remain
separate tests.

See `evidence/bridge-cold-restore-v2.json`. The private archive and all raw
ledgers, keys, checkpoints and logs remain on the worker. Preserve the passed
`/data/bridge-cold-restore-v2` attempt; a future drill needs a new reviewed root.
This restores the synthetic prototype, whose budget is still not complete
funded mainnet backing. Full-validator consensus, custody, independent operators
and security review remain required.

## V2 SIGKILL recovery

Ten actual checks now pass after SIGKILL of each newly started private copied
validator. The kill guard pins its exact binary, copied-ledger argument and
isolated process group; both actual exits are -9 while processed slots exceed
finalized slots. RPC outage returns no source observation. Both same-genesis
restarts preserve all20 finalized bridge accounts, bootstrap floor/record,
counters, balances and replay protection. Four replay simulations reject
without state changes; zero broadcasts. All four process starts terminate and
original cold inventory hashes remain unchanged. Ten copy/crash guards pass.

This tests already-finalized state after a process crash. It does not test
unknown landing, a pending-operation crash, a competing fork, kernel failure
or physical power loss. The synthetic budget still lacks complete funded
mainnet backing. See `evidence/bridge-hard-crash-v2.json`. Keys/checkpoints/logs
stay private in the retained `/data/bridge-hard-crash-v2` attempt; future drills
need a new reviewed root, never replay/reset this driver.

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


## Positive V2 pending original withdrawal

Seven actual checks now pass on NEW private ledger copies with native return
nonce7 and one journaled original withdrawal. A confirmed withdrawal at slot944
was observed with finalized root913 before guarded copied-origin SIGKILL(-9).
The same original signature, signed bytes and receipt finalized after restart,
with exact10000-token escrow debit and recipient credit. Recipient native
balance stayed unchanged; exact large fee-payer metadata remained lossless.

Finalized heights912 before kill and943 after recovery are below the original
signed expiry1060. Both outstanding counters and escrow reconcile at1950000,
original user50000, native reserve52000000/floor2000000, bootstrap unchanged.
Ten copy/crash guards pass. All3copied process starts stopped, original baseline
ledgers/input/native journal unchanged, canonical runtime frozen.

This is a new positive process-crash case, not an authorized retry of the
separate unresolved nonce6 operation. Competing forks, physical host failure,
independent verification/custody, actual funded inventory, full validators
and external security review remain open. See
`evidence/bridge-v2-redemption-pending-crash.json`.

## Programme/policy pin observer

The separate read-only `bridge/program-pins.mjs` observer verifies explicit
trusted Loader-v3 code/account/upgrade-authority pins and the bridge's static
358-byte policy. Two finalized reads and repeated genesis admission reject
changed programme bytes, loader pointers, authorities, committee/epoch/pause
or caps while allowing normal exact counter updates. Twelve local tests pass.
No signing, journal write, simulation or broadcast method is supplied.

The existing journal does not yet require this observer before handoff.
Production integration, authenticated independent observers, upgrade/custody
controls and review remain open. A pinned RPC snapshot is not complete
backing, permanent immutability or finality consensus. See
`bridge/FINALITY_RECOVERY.md` for the exact scope and bounds.

## Authenticated review-report codec

`bridge/observer-reports.mjs` verifies domain-separated Ed25519 reports from
three distinct keys in a fixed five-key private review roster. Reports bind
the original operation, code-pin/accounting digests and observation context.
The combined expiry review reinspects the journal and rejects late settlement,
changed obligations or missing history. Twelve new local synthetic tests and
seven structural regressions pass. No private signing keys are accepted by the verifier;
no signing, RPC, journal mutation, retry or broadcast method is enabled.

Key authentication does not establish operator identity, independence or the
truth of asserted history/backing. A production roster, verifier processes,
reviewed custody and signer integration remain open. All release/settlement
and retry controls stay disabled. See `bridge/EXPIRED_RECOVERY.md`.


## Pinned private-journal handoff integration

New version2 private claim journals commit exact programme, code, complete
ProgrammeData, upgrade authority and static-policy pins for both chains.
Both handoff entry points enforce those committed pins. Two finalized reads
per side before and after source observation, matching epoch/precision/full
committee, settlement pause and final expiry/receipt checks gate returning
the existing signed bytes exactly once. Historical version1 rehearsals keep
their original semantics, with no retrospective pin acceptance.

Eighteen new and64 existing local tests pass. Both directions survive later
reconciliation checkpoints; late upgrades, expiry, new receipts and corruption
reject. This is synthetic local integration, not a new combined Agave drill
or a production signer/custody deployment. Snapshots do not prove historical
execution or prevent upgrades after observation; locally writable journals
are not authenticated by their policy digest. Production upgrade controls,
independent history/backing/finality and security review remain required.
See `bridge/PENDING_CLAIMS.md` and
`evidence/bridge-pinned-journal-integration.json`.


## Actual pinned-journal private round trip

Eight checks pass on new private copied Agave ledgers, with two source and
two settlement broadcasts, both directions finalized, six deliberately wrong
expected pin handoffs rejected and exact final counters/escrow/reserve restored
to baseline. Both copies stopped and original ledger/input/journal hashes match.
First zero-transaction checkpoint-RPC refusal is preserved; fresh v2 readiness
waited for retained finalized minima without lowering them. Three worker and
six copy guards pass. See `evidence/bridge-pinned-journal-agave.json`.

This is functional known-finalized integration, not a new crash/fork, actual
upgrade, production custody or funded-mainnet proof. All previous private
branches, including expired nonce6, remain preserved and separate.


## Actual authority changes before claim handoff

Seven checks pass on new private copied Agave ledgers. After preparing a pinned
native claim, checked Loader-v3 authority changes finalize on the destination
and source programmes. Each changed account fails the original reviewed pin,
and the claim cannot leave its prepared journal. Exact byte comparison confirms
only the authority changed; programme code did not. Zero claim handoffs or
settlement broadcasts occurred, and the10000-unit pending source obligation
remains intact. Both copied validators stopped; original baseline and journal
hashes match. See `evidence/bridge-authority-change-agave.json`.

This is an actual authority-change guard, not a code-upgrade, fork, crash,
independent custody or production signer result. It does not resolve the
separate expired nonce6 operation or change the running devnet candidate.


## Original mint and escrow snapshot observer

`bridge/origin-assets.mjs` now verifies the immutable unextended Token-2022 mint,
independently selected exact supply/precision, escrow vault authority and
recorded original-token obligations. Programme pins bracket two stable finalized
asset snapshots. Twenty-seven local checks and three worker guards pass.
Five actual private-copy checks pass with30 read-only RPC calls, zero simulations
or broadcasts, unchanged original ledgers/journal and a stopped copied process.
See `evidence/bridge-origin-assets-agave.json` and `bridge/ORIGIN_ASSETS.md`.

An earlier partial historical pin record refused admission before asset reads;
its failure remains retained. This observer does not support token extensions,
independently pin Token-2022 bytecode, verify native reserve/global genesis or
complete pending-event history, appoint independent operators, or authorize
signing/recovery. Those release requirements remain open.


## Native reserve and bootstrap snapshot observer

`bridge/native-reserve.mjs` verifies native V2 custody, the protected floor and
rent, the exact selected bootstrap record and consumed source receipt, and
remaining original-token claim capacity. It reads native lamports without
JavaScript rounding and brackets two stable account snapshots with programme
pins. Twenty-nine related local checks and three worker guards pass.

Five actual checks pass on one fresh private copied native ledger with30
read-only RPC calls, zero simulations/broadcasts, a stopped copied validator
and unchanged original ledgers/fixture/journal. Wrong selected inventory and
receipt inputs reject. See `evidence/bridge-native-reserve-agave.json` and
`bridge/NATIVE_RESERVE.md`. The witness remains a synthetic budget, whose digest
does not establish complete genesis contents or funded backing. The original
escrow and native reserve observations are separate, not an atomic cross-chain
or independently authenticated production proof. Monetary gates remain closed.
