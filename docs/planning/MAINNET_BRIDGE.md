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

An especially important gap is bootstrap accounting: the current native bridge
initializes outstanding balances at zero. Genesis allocations cannot be enabled
with that assumption. Production remains blocked until every initial native
balance is backed, its origin escrow is finalized, and both bridge counters
reconcile to the initial state.

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
