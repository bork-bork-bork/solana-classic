# Preserve developer programmes through a reviewed devnet cutover

Developer programmes and their accounts now exist on the canonical devnet.
The earlier backup/rehearsal predates these accounts. It cannot prove their
continuity through the eventual source-built runtime migration.

`developer-continuity.mjs` reads four fixed public accounts through the branded
RPC: the deployed counter programme, its ProgramData, and the Node/browser
counter state accounts. It checks finalized account data, exact bytecode hash,
upgrade/state authorities, ownership and the programme pointer. It rechecks
genesis after the account read. A comparison also rejects older context slots
or changes to any account's bytes, lamports, owner or executable flag. It never
signs, writes, restarts or opens a migration gate.

Use the pinned project Node runtime:

```sh
node engine/migration/developer-continuity.mjs > /private/path/baseline.json
node engine/migration/developer-continuity.mjs --compare /private/path/baseline.json
node --test engine/migration/developer-continuity.test.mjs
```

The committed test binary fixture is the original counter's public upgrade
variant, SHA256 `6555ed5d83319fcc45d7c64c7638cb357097314ae73d1a0c55df35a3e1d6798f`.
It contains no keys; tests work without private developer journals or a compiler.

## Required maintenance sequence

1. Pass the existing migration preflight and obtain the separate concrete
   cutover decision. Do not infer approval from elapsed stability time.
2. Hold application writes and stop the existing ledger writer according to
   the migration runbook. Take a fresh consistent backup of the ledger,
   database, immutable artwork and configuration; hash and retain it privately.
3. Capture an authoritative stopped-writer account baseline from an isolated
   read of that backup. Include **all** newly deployed programmes and application
   accounts, not only these four known counter accounts. Check public programme
   IDs/bytecode/authorities against each builder's release evidence.
4. Restore the fresh backup on the held candidate. Compare the complete account
   inventory, database and asset manifests before opening writes. These four
   accounts provide a targeted regression check; they are not a chain inventory.
5. Preserve the backup and rollback image until the candidate's separately
   required stability run passes. If continuity fails, keep writes held and
   investigate or use the reviewed rollback path. Do not reset the ledger.

While developers can mutate accounts, this read-only sample is only a current
observation. An expected authorised change needs a newly reviewed baseline.
Receipt history can be pruned; verify account state and use retained receipts
as supplemental evidence. Devnet continuity never allocates mainnet balances.
