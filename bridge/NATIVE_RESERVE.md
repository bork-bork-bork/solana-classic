# Read-only native reserve and bootstrap observation

`native-reserve.mjs` exports `observeNativeReserve`. It accepts a private
loopback RPC, reviewed native-side programme pins, an independently selected
bootstrap witness, original precision and a retained finalized checkpoint.
Public Solana networks and the live Classic devnet reject before RPC access.
There is no signer, private-key input, simulation, broadcast, retry, journal
write or release approval.

The observer brackets two stable finalized snapshots with full programme,
ProgramData, upgrade-authority and bridge-policy checks. Each native snapshot
reads the derived config, V2 vault, immutable bootstrap record, independently
selected consumed receipt and rent sysvar together. Contexts cannot regress;
asset bytes, reserve balance and recorded obligations must remain stable through
the final code check. Native balances use the original JSON integer digits under
Node24, preserving full u64 precision instead of rounded JavaScript numbers.

The bootstrap record must match every selected amount and inventory digest.
Its source event must derive the selected claim receipt, whose programme-owned
32 bytes must contain that same event address. The vault must have the recorded
protected floor, at least its rent requirement. Only exact supported integer
rent thresholds are accepted; fractional or oversized rent calculations reject.

For original mint supply `S`, native outstanding `O` in original base units,
conversion factor `F = 10^(9 - originalDecimals)`, and protected floor `P`:

```text
minimum reconciled reserve = (S - O) * F + P
unallocated native surplus = actual vault balance - minimum reconciled reserve
```

A negative surplus rejects, even if the floor alone remains covered. Extra
native units are reported separately rather than treated as new issuance or
an authorized withdrawal. The selected initial budget must also reconcile
original supply, total native units, allocations outside the reserve, initial
reserve and bootstrap backing. No accounting field can use a float or exceed
u64. Source token supply/authorities come from a separately reviewed observation;
this native observer does not fetch or prove the original escrow itself.

`native-reserve-input.mjs` selects private-fixture inputs from the complete
historical pinned-journal review, immutable origin-asset observation and bootstrap
review. It keeps the native finalized checkpoint and rejects unfinished,
mismatched or production-labelled fixture records. It does not authenticate
review authors or learn trusted fields from a fresh endpoint.

Run with pinned Node24:

```sh
node --test bridge/native-reserve.test.mjs bridge/native-reserve-input.test.mjs bridge/program-pins.test.mjs
```

This verifies a reserve snapshot against a declared witness. An inventory digest
is not proof of inventory contents, and the private fixture's hypothetical
budget does not cover its complete validator supply. Independent original-chain
finality, complete native genesis/backing, all pending events, custody and actual
operator independence remain open. Snapshots cannot prevent an authority upgrade
after observation or prove economic history. Production, retry, signing and
broadcast flags remain false.

The separate private-copy runner verifies actual reads and wrong selected
inventory/receipt expectations without modifying bridge accounts. A passed
worker result must include its copied validator stopped and both original
ledger inventories, source fixture and finalized journal unchanged. Source or
local tests alone do not establish actual private-chain execution.


Five actual private-copy checks now pass with30 read-only RPC calls and zero
simulations or broadcasts. The fixture reserve is52000000native base units,
including a2000000protected floor and50000000remaining capacity; minimum vault
rent is1002240. There is no unallocated surplus. Wrong selected inventory and
receipt inputs reject. A fresh read retains the same exact account/balance
hashes. The copied native validator stopped; both original ledger, fixture and
finalized journal hashes match. See
[the actual result](../evidence/bridge-native-reserve-agave.json).

Twenty-nine related local checks and three worker guards pass. These results
accept only this private component observation. Complete inventory/backing,
source economic history, independent operators/custody and production release
remain unverified.
