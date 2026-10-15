# Private code-replacement refusal check

A changed programme implementation must not inherit the old implementation's
settlement approval just because the programme address and upgrade authority
are unchanged. The private rehearsal replaces the destination bridge's ELF
with the separately reviewed public counter example. It deliberately installs
an incompatible programme, not a new approved bridge version. No claim is
submitted to that replacement.

`upgrade-observation.mjs` compares the complete previously pinned ProgramData
with finalized replacement bytes. It checks the expected original and new ELF,
unchanged loader, authority, capacity and rent balance, an advancing deployment
slot, and zero unused code capacity. Its result confirms replacement facts;
`replacementApprovedForSettlement`, signing and broadcast flags stay false.
This is a comparison helper, not a source of trusted pins or upgrade approval.

The actual runner uses new stopped-ledger copies and the existing synthetic
fixture. It stages a fresh Loader-v3 buffer, creates a new origin lock, prepares
one pinned native claim, and then upgrades only the native-side programme.
The old source programme must still pass. The old destination pins and original
claim handoff must reject while the signed claim remains unexpired. Journal
bytes, attempts0, receipt absence, exact escrow/counters, bootstrap record and
protected floor must remain unchanged after rejection.

Buffer setup occurs before claim preparation so an expired signature cannot be
mistaken for a code-pin refusal. Each signed setup/upgrade transaction is saved
privately before its single broadcast; no automatic retries or replacements are
permitted. Both copied processes must stop and both original ledger inventories,
fixture and original finalized journal must be rechecked. Failed attempts stay
retained. Private keys, signed bytes, logs and raw ledgers are never exported.

This covers a deliberately incompatible destination replacement. It does not
approve a compatible upgrade, migrate state, verify original-side code changes,
solve competing forks, appoint independent operators, fund a genesis budget,
or establish production custody/security. An authorized upgrade can still
change bridge semantics; snapshot checks cannot prevent a later upgrade.

Local verification:

```sh
node --test bridge/upgrade-observation.test.mjs bridge/program-pins.test.mjs bridge/pinned-pending.test.mjs
python3 engine/rehearsal/code_replacement_test.py
```

Six actual checks passed on two new private copied Agave ledgers. Six buffer
setup transactions, one incompatible native upgrade and one new source lock
finalized. The original claim was still unexpired when its old code pins
refused handoff: attempts0, no settlement broadcast, unchanged private journal,
absent receipt and unchanged escrow/counters/reserve after rejection. Both
copied processes stopped and originals match. See
[the actual result](../evidence/bridge-code-replacement-agave.json).
