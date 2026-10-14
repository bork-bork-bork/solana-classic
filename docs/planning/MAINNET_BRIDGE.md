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
