# Fresh private three-validator package

`consensus.py` prepares a real full-Agave rehearsal from an explicitly reviewed
private genesis bundle. Its default operation only checks admission. Starting
processes additionally requires `--run --ack fresh-private-three-validators`.
No mainnet, real SOC or bridge activation is implemented by this package.

The host must pass `host-preflight.py` with the exact reviewed binaries before
any bundle keys are opened or a new ledger is created. The separately named
`classic-genesis-audit-v2` verifies actual genesis identity, every allocation
and integer capitalization. Its source, lockfile and compiled artifact hashes
are recorded in `consensus-audit-artifact.json`; the original auditor is retained.

## Required private inputs

Use a fresh package under `/data/mainnet-consensus-v2/bundles/<bundle-id>/`:

```text
manifest.json
genesis/genesis.bin
genesis/genesis.tar.bz2
keys/node-0-identity.json
keys/node-1-identity.json
keys/node-2-identity.json
```

The identity files contain newly generated disposable rehearsal keypairs, owned
by the operator and readable only by that owner. Do not import production keys,
wallets, devnet operators or bridge fixtures. No runtime ledger, accounts DB,
backup, snapshot or symbolic link belongs in the genesis directory. Supply the
three already bootstrapped vote/stake public keys in the manifest; staking and
withdrawal keys are not read by this launcher.

The exact manifest fields are `schemaVersion:1`,
`scope:"fresh-private-consensus-rehearsal"`, the pinned `runtimeSource`,
`genesis`, `bankHash`, `shredVersion`, `genesisBinSHA256`,
`genesisArchiveSHA256`, `inventorySHA256`, `totalNativeUnits` and `validators`.
`validators` contains exactly three objects with distinct `identity`, `vote`
and `stake` public keys. Supply is an exact decimal base-unit string. The
inventory digest uses the auditor's full `accounts` list encoded with sorted
object keys and compact JSON separators, without reordering the list.

The genesis must be newly built with hashing PoH, for example the pinned
`solana-genesis --hashes-per-tick auto`, zero inflation and the explicitly chosen
zero-burn synthetic policy. The previously retained non-hashing `sleep` genesis
is refused. Its successful old accounting audit cannot accept this new run.

**The slot-zero bank hash and shred version are separate reviewed inputs.**
The genesis hash is not a bank hash. The read-only genesis-account auditor does
not derive a bank hash or approve one. Obtain these values from reviewed ledger
initialization tooling on the capable private host; never guess or substitute
the genesis hash. All three validators enforce both values at startup and wait
for a stake supermajority at slot0. No new hashing genesis or slot-zero bank
hash has been prepared on the current blocked host.

## Commands after input review

First perform admission only:

```sh
python3 mainnet/consensus.py \
  --binary-directory <reviewed-binary-directory> \
  --bundle /data/mainnet-consensus-v2/bundles/<bundle-id> \
  --run-id <new-attempt-id>
```

A successful check prints `packet-checked`. This does not start processes and
does not verify consensus. The runtime, rather than this offline checker,
enforces the selected bank hash. To execute the reviewed private attempt:

```sh
python3 mainnet/consensus.py \
  --binary-directory <reviewed-binary-directory> \
  --bundle /data/mainnet-consensus-v2/bundles/<bundle-id> \
  --run-id <new-attempt-id> \
  --run --ack fresh-private-three-validators
```

A new owner-only directory is created under `runs/<new-attempt-id>`. Existing
attempts are refused, never reset or overwritten. The launcher refuses a
canonical service, other active validators, changed genesis bytes and occupied
ports before starting. Before any key is opened, the pinned archive must contain the exact selected
`genesis.bin` and initial `rocksdb` block data. A bounded reader rejects extra
paths, links, special files, duplicates, file/directory collisions, mismatched
genesis bytes and oversized or concatenated compressed streams. Each fresh
ledger receives those verified initial blocks with owner-only permissions.
The executable is rechecked before each start.

## What is checked

Agave's normal network, PoH speed and host checks stay enabled. There is no
`--no-port-check`, `--no-poh-speed-test`, `--no-os-network-limits-test` or
`--no-wait-for-vote-to-start-leader`. Each node waits for a slot-zero stake
supermajority using the selected bank/shred pins. Explicit fresh genesis files
are copied locally; automatic genesis/snapshot fetching is disabled.

All networking is loopback-only. Each node has disjoint RPC/WebSocket, gossip
and dynamic ports, checked for availability. Its RPC must report the expected
identity, version and genesis, all three active rooted vote accounts, exact
synthetic capitalization and zero inflation. The nodes must agree on a common
finalized block and independently advance finalized slots over a bounded
observation. Only read-only RPC methods are permitted by the observer.

Owned child processes are stopped at the end, including partial-start failures.
A forced stop, cleanup error or unexpected child exit prevents success. Raw
keys, genesis/accounts and private logs remain in the selected host package;
`public-result.json` omits supplied paths and raw errors. Retain every failure.

## Acceptance still required

Fourteen local launcher checks, ten archive checks and five host admission
checks pass. Actual bounded extraction of the retained synthetic archive
reproduced its genesis and eight initial blockstore files without changing
the originals or starting validators. See
[the archive verification](../evidence/mainnet-genesis-archive.json). The
separate auditor reproduced the actual retained249-account inventory without
changing it. An actual check-only invocation refused the existing host before
opening the nonexistent bundle, creating the run namespace or starting nodes.
This is preparation evidence, not successful full-validator execution.

A capable host, fresh hashing genesis and separately verified bank/shred pins
remain required. After actual consensus: execution journeys, quorum-loss and
recovery/cold-restore tests, independent hosts/operators, actual funded genesis
and reserve custody, economics, bridge recovery and external security review.
Three processes on one host cannot establish operator independence.

## Why the initial blocks matter

Pinned Agave `create_new_ledger` writes the genesis configuration and fills
slot0 with ticks linked to that configuration, then puts both `genesis.bin`
and the initial RocksDB in `genesis.tar.bz2`. Its `open_genesis_config` returns
immediately when a standalone `genesis.bin` already loads; it only unpacks the
archive after that load fails. Merely copying both files does not materialize
the initial blockstore. The launcher therefore validates and unpacks the
selected archive explicitly into each new ledger. It never copies a runtime
ledger or snapshot from another network.

This validates archive identity and safe materialization, not block replay,
a reviewed slot-zero bank hash, PoH speed or consensus. A separate pinned
`agave-ledger-tool` build is being prepared for that review. Its build alone
cannot satisfy host admission or accept a new genesis.
