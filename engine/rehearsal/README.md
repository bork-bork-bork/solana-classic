# Private network rehearsals

These scripts run on the separate source-build worker, never the validator
under the testnet stability run. All keys, ledgers and diagnostic logs stay in
private `/data` directories. Uploaded inputs are public code and checked program
binaries. Export only the named public result JSON files.

`two-chain.py` starts two fresh, independent, loopback-only Agave 3.0.14 test
ledgers. RPC, websocket, faucet, gossip and dynamic ports are separate. It deploys
the compiled bridge through upgradeable-loader transactions with disposable
upgrade authority, then runs `bridge/rehearsal/two-chain.mjs`. The result checks
finalized escrow → native release → native return → original redemption,
replays, a wrong destination, insufficient quorum, empty reserve and exact
counter reconciliation. Three synthetic committee keys co-sign locally. This
does not appoint independent verifiers, demonstrate a trustless bridge or test
an actual Solana production mint. RPC outage/recovery, fork policy, bootstrap
backing and independent security review are separate work.

`validators.py` creates fresh keys for three full `agave-validator` processes,
uses source-built `solana-genesis`, and compiles no engine patches. An unlaunched
budget probe measures all system/vote/feature allocations; the final genesis
reserve is the exact remainder of the synthetic budget. The read-only
`mainnet/genesis-audit` tool enumerates every genesis account. The rehearsal
checks common genesis, participating vote accounts, finalized progress and
runtime inflation/capitalization. All nodes are on one host. They are distinct
node identities, not independent operators or a production consensus result.

Scripts refuse replaying an attempt and reject the soaking or known public
Solana genesi. Retain failed attempts and ledgers before preparing a new attempt;
never reset or copy the soaking ledger. Stop rehearsal processes gracefully.
Serialize the two-ledger and three-validator jobs to bound memory use.

No monetary mainnet, native SOC distribution, original SOC purchase, liquidity
pool, public bridge route or production signer custody is activated. The verified
old source-build record and migration image remain unchanged.

## Controlled process/RPC recovery

`recovery.py` and `bridge/rehearsal/recovery.mjs` reopen only the completed,
stopped private bridge fixture. The source-built test-validator binary is
checksum-pinned. A new `/data/bridge-recovery-v1` directory refuses attempt
replay, any active private validator, public/soaking genesi or changed fixture
identity. A cold tar archive retains the old stopped ledgers and private input
before reopening them; it is not a tested cold restore.

Seven actual checks passed: finalized events and claim receipts exist; each
RPC outage refuses observation; the other ledger's accounts remain unchanged;
both process restarts preserve account bytes, owners, lamports and counters;
consumed native-release/original-redemption claims still reject replay in the
compiled bridge; those simulations leave state unchanged. Zero new broadcasts.
Four Python boundary tests pass:

```sh
python3 -m unittest engine/rehearsal/recovery_test.py
```

The worker recorded SIGINT exits (-2), not application-level graceful flushing.
All four started processes stopped. See `evidence/bridge-ledger-recovery.json`.
Pending-operation settlement, a competing pre-finalized fork, SIGKILL/power
loss, cold restore and independent finality verification remain separate work.
Do not rerun/reset these retained attempts or expose their keys/archives/logs.

## Pending native-claim settlement

`pending.py` imports the recovery helper and stages a new synthetic lock/claim
on the same retained private ledgers. `/data/bridge-pending-v1` refuses an
existing attempt, active private process, changed binary or invalid genesis.
It retains a new stopped-ledger archive before the synthetic operation.
The journal is fsynced before the caller's single claim broadcast. The fault
harness waits for finalization while the client remains unconfirmed, stops
only the private destination RPC, and then reconciles the original signature,
receipt, exact native economic deltas and matching counters after restart.

Six actual checks passed; all three started processes stopped. See
`evidence/bridge-pending-recovery.json` and `bridge/PENDING_CLAIMS.md`.
**The retained private counters are now 700,000 origin units, and nonce 3 is used.**
Do not rerun either passed attempt or assume its earlier 600,000-unit baseline.
Future drills need a new reviewed baseline/directory/nonce. Unknown landing,
expiry/pruning, origin redemption, cold restore and actual fork policy remain
open. None of these fixture balances allocate mainnet SOC.

## Original-token pending redemption

`redemption.py` and `bridge/rehearsal/redemption.mjs` retain a fresh cold archive
in `/data/bridge-redemption-v1`, then stage a 100,000-unit native return (nonce 4)
and one journaled original redemption. Six actual checks pass through an
origin RPC outage/restart; signature/receipt/token debits/credits reconcile.
All three processes stopped. The fault harness waited for finality; no fork
or unknown-landing result. See `evidence/bridge-redemption-recovery.json`.

Current retained private counters are 600,000 on both sides, escrow 600,000 and
original user 1,400,000. **Nonces 3 and 4 are used and new accounts/receipts exist.**
Equal totals do not restore the old baseline. Preserve all passed attempts,
archives and journals; do not rerun/reset them. Future work needs a new reviewed
baseline/directory/nonce. Shared two-direction journal tests total 23.

## Fresh V2 bootstrap execution

`bootstrap.py` and `bridge/rehearsal/bootstrap.mjs` use only a new private
`/data/bridge-bootstrap-v2` directory and fresh loopback ledgers. The source-built
Agave3.0.14 binary, V2 bridge SBF and Token-2022 artifacts are checksum-pinned.
Both deployed programs and upgrade authorities are read back before execution.
The script refuses replay, active private validators, an occupied RPC port,
changed uploaded source or public/soaking/repeated identities. Three Python
boundary checks pass. Source upload uses bounded idempotent binary chunks with
a final checksum; no keys are supplied from the development machine.

This rehearsal uses an explicitly hypothetical two-row native budget. It is
not a complete inventory of the test-validator, whose large global synthetic
supply is read using Python's exact integer JSON parser and retained as a
string. The public result marks `completeInventoryVerified` and
`actualGenesisBackingVerified` false and requires the hypothetical budget to
differ from observed global supply. Successful program execution proves the
V2 wire/state path; it cannot pass B3, full mainnet supply/custody or independent
source-finality gates. A committee can attest a false inventory, so those
independent production checks are material requirements.

The bounded native vault is funded by an actual system transfer; initial source
backing is locked in immutable Token-2022 escrow. The harness verifies zero
native release during bootstrap, initial counters, immutable bootstrap/claim
receipts, replay and altered-recipient rejection, malformed-budget and quorum
rejection, protected-floor limits and subsequent return/redemption. Successful
mutations finalize on the two private Agave ledgers; rejected cases use actual
RPC simulation. Its synthetic committee/authority are local keys, not
independent operators. No retry of an uncertain transaction or production
signer service is implemented. Preserve all private input, journals and logs.

All private processes must stop before exporting the named public result.
SIGINT exit evidence is recorded separately from application-level flushing,
crash or cold restore. Earlier V1 fixture ledgers and program artifacts stay
unchanged. Future recovery attempts require new reviewed directories/baselines.

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


## Pinned-journal two-direction rehearsal

`pinned_journal.py` and `bridge/rehearsal/pinned-journal.mjs` use NEW cold
copies of the stopped positive nonce7 branch, isolated loopback ports and the
pinned source-built test-validator. Retained historical public programme pins
are uploaded with all current client dependencies and included in source
hashes. Health alone is insufficient: both finalized roots must reach the
retained checkpoints before pin observations. Checkpoint values are never
lowered to make a run pass.

The first `/data/bridge-pinned-journal-v1` attempt refused a checkpoint-bound
RPC observation before any transaction. Both copy processes stopped; original
baseline/journal hashes match the prior reviewed proof. Its source and public
failed outcome remain in `evidence/bridge-pinned-journal-first-*`. No raw keys,
signed journals or private logs are exported. Do not rerun/reset that root.

The repaired v2 attempt uses distinct unused origin-lock nonce8 and native-return
nonce9 on new copies. At most two source and two journaled settlement broadcasts
are permitted. Before each valid handoff, three deliberately wrong expected
code/authority/policy pins must reject against actual accounts, leave their
private prepared records unchanged and produce no economic movement. These
are wrong-pin tests, not actual upgrades or malicious policy changes. Valid
version2 journals must reconcile the same finalized signatures and exact
native/token movements, retain their pin admissions at later checkpoints and
refuse every repeated handoff. Final escrow/counters/reserve and bootstrap
floor/record must return to the selected baseline.

This is a known-finalized functional integration. It does not reuse or gain
the earlier SIGKILL, fork, physical power-loss or economic-backing acceptance.
Independent custody/upgrade/signing controls and funded complete genesis
backing remain required. Preserve every attempt root after completion, stop
all copied processes and verify original ledger/input/journal hashes.


## Actual programme authority changes

`authority_change.py` and `bridge/rehearsal/authority-change.mjs` now pass seven
actual checks using fresh cold copies of the stopped positive nonce7 baseline.
Unused source nonce10 creates one synthetic lock, then a version2 claim remains
prepared while checked authority rotations finalize on both copied programmes.
Both rotations must change only authority bytes; the old pinned observer and
journal handoff reject, with no signed claim bytes released and no settlement
broadcast. Pending liability remains10000original units. The source lock and
two authority transactions are private-fixture mutations, not mainnet actions.

Both copy processes stop and original ledger/input/journal hashes match. Three
worker guards and30 related observer/journal regressions pass. Preserve this
new attempt and its prepared journal; never rerun, refund or reset it. Programme
code stayed identical, so this is not actual code-upgrade acceptance. See
`evidence/bridge-authority-change-agave.json` for source hashes and scope.


## Original mint and escrow observer

`origin_assets.py` now runs five actual checks on one new private origin-ledger
copy using complete historical programme pins and their retained finalized
checkpoint. It verifies the immutable plain Token-2022 mint and exact source
escrow/obligations, rejects wrong independently selected supply/precision and
rereads unchanged asset hashes. Thirty read-only RPC calls, zero simulations
or broadcasts. The one copied validator stops and both original ledger,
fixture and finalized journal hashes match. Twenty-seven related local checks
and three worker guards pass.

The first attempt refused an incomplete older review record before asset RPC
reads. Preserve both attempts and all source records; neither runner may be
replayed/reset. This is a private fixture observation, not complete native
backing, token-extension, Token-2022 executable, history, consensus or production
custody acceptance. See `evidence/bridge-origin-assets-agave.json` and the retained
`evidence/bridge-origin-assets-first-attempt.json`.


## Native reserve and bootstrap observer

`native_reserve.py` and `bridge/rehearsal/native-reserve.mjs` now pass five actual
checks on one NEW private native-ledger copy. Complete public pin, origin-asset
and bootstrap reviews select exact inputs before any RPC read. The observer
reconciles the V2 reserve, protected rent floor, bootstrap inventory/amounts,
consumed receipt and remaining original-token capacity. Wrong inventory and
receipt inputs reject; a fresh read retains exact state and balance hashes.
Thirty read-only calls, zero simulations/broadcasts. One copied process stopped,
and both original ledger inventories plus fixture/finalized journal hashes
match. Twenty-nine local checks and three worker guards pass.

Preserve the attempt and every prior branch. No source lock, settlement,
recovery retry or monetary activation occurred. The budget remains hypothetical
and does not cover complete validator supply. See
`evidence/bridge-native-reserve-agave.json` for exact source hashes and limits.


The new `origin_token_code.py` / `bridge/rehearsal/origin-token-code.mjs`
read-only copy checks additionally select the Token-2022 release artifact and
genesis authority before bracketing origin asset observations with deployed-code
admission. Five actual checks pass;40 read-only RPC calls, no simulations or
broadcasts, one stopped copy and unchanged originals. See
`evidence/bridge-origin-token-code-agave.json` and `bridge/TOKEN_CODE.md`.


`code_replacement.py` and `bridge/rehearsal/code-replacement.mjs` test an
actual incompatible native-side programme upgrade on new private ledger copies.
The still-unexpired prepared claim refuses handoff through the existing code-pin
guard. Six actual checks passed, zero settlement broadcasts, unchanged originals
and both copies stopped. See `bridge/CODE_REPLACEMENT.md` and
`evidence/bridge-code-replacement-agave.json`. This does not approve a new bridge
version or a compatible state migration.
