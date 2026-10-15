# Token code admission for private origin observations

`origin-token-code.mjs` verifies the Token-2022 implementation behind the mint
and escrow owner address. It accepts separately selected private-chain code
pins: the exact ELF digest and size, complete ProgramData digest and explicit
upgrade authority. It derives the Loader-v3 ProgramData address and checks the
executable pointer, loader ownership, account types, code and unused capacity.
Two finalized snapshots must meet a retained checkpoint and the selected pins;
genesis is checked before and after. Missing, changed, malformed or unavailable
state fails without cached success. Public networks and the canonical Classic
devnet are refused before reads. No keys, signing or broadcasts are accepted.

`observeTokenPinnedOriginAssets` brackets the existing mint/escrow and bridge
code checks with this token-code admission. It fixes all selected pins before
awaiting RPC, checks matching origin identities, and carries finalized context
forward through each observation. The result is a bounded sequence of RPC
snapshots, not an atomic cross-chain snapshot or proof of historical behavior.

`genesisTokenCodePins` is an offline helper for the retained private fixture's
slot-zero installation. The caller selects a trusted local public artifact,
expected release digest/size and explicit authority. The helper builds the
expected slot-zero ProgramData header; it never learns a trusted pin from RPC.
An upgraded installation needs separately reviewed complete deployment pins.
The fixture uses the default public key as its configured token authority,
matching the pinned test-validator's `--bpf-program` genesis path. This is
reported as the selected authority, without claiming general production
immutability or an independent operator's custody review.

The original `observeOriginAssets` remains available with its older, explicitly
narrower guarantees. New composed callers must use the token-pinned wrapper;
this work does not change existing signer handoff or authorize settlement.
Token extensions, pending-event completeness, actual funded genesis, forks,
future upgrades and independent operator/security review remain separate gates.

Local checks:

```sh
node --test bridge/origin-token-code.test.mjs bridge/origin-assets.test.mjs bridge/program-pins.test.mjs
python3 engine/rehearsal/origin_token_code_test.py
```

The separate actual-ledger runner uses a new private copy only, reads the
previously reviewed public artifact and historical pins, and never copies
fixture keys into its attempt. It must retain its result, stop its copied
process and recheck both original inventories plus the original fixture and
finalized journal before an execution milestone can be published.

Five actual checks now pass on one new private copied Agave ledger, with40
read-only RPC calls and zero simulations or broadcasts. Incorrect selected
complete ProgramData and authority pins reject against deployed state. A fresh
composed observation preserves the exact2000000-unit mint supply and1950000-unit
escrow/obligation balance. The copied process stopped; both original inventories,
fixture and finalized journal remain unchanged. See
[the actual result](../evidence/bridge-origin-token-code-agave.json).
