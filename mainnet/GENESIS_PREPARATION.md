# Fresh synthetic genesis preparation

`prepare-consensus.py` closes the input-preparation gap before a private full
validator rehearsal. It never starts validators, sends a transaction or
activates mainnet or a bridge. The current host remains blocked before keys
or genesis are created. A successful build or local driver cannot supply a
real bank hash.

## Required tools and host

Transfer or reproduce the exact reviewed Linux x86_64 binaries into one private
directory: `agave-validator`, `solana-genesis`, `solana-keygen`,
`classic-genesis-audit-v2` and `agave-ledger-tool`. Their selected digests are in
`host-preflight.py`, `consensus-audit-artifact.json` and
`ledger-tool-artifact.json`. Keep this repository's mainnet scripts and those
manifests together. The pinned ledger tool was compiled from the complete
reviewed Agave source tree; existing runtime binaries were unchanged.

The same host admission applies as for the three-validator launcher: Linux
x86_64, hard open-file limit at least 1,000,000, four effective CPU cores,
16 GiB effective memory and 16 GiB available private storage. These are the
private rehearsal profile, not production sizing. No lower host requirement,
check bypass or automatically provisioned server is implemented.

## Default: read-only admission

```sh
python3 mainnet/prepare-consensus.py \
  --binary-directory <reviewed-binary-directory> \
  --bundle-id <fresh-private-bundle-id>
```

Exit 0 with `preparation-host-admitted` means only that host and selected tools
pass these checks. It creates no keys, directories or ledgers. It does not
review an existing bundle or start a rehearsal. Exit 78 is a blocker. Both
modes returned 78 on the existing host, before private preparation, with the
hard-file-limit and declared memory-profile failures recorded.

## Explicit private preparation after admission

Review the host, resource budget and new bundle identifier first. This command
creates disposable private keys and a new valueless synthetic genesis:

```sh
python3 mainnet/prepare-consensus.py \
  --binary-directory <reviewed-binary-directory> \
  --bundle-id <fresh-private-bundle-id> \
  --prepare --ack fresh-private-synthetic-genesis
```

The tool refuses the canonical service, any active validator, unsafe/shared
output directories and a retained identifier. New owner-only attempts live
under `/data/mainnet-consensus-v2/preparations/`; bundles live under its
`bundles/` directory. The generated keys remain there. Never import production,
origin-chain, devnet or earlier rehearsal keys. Retain every failed attempt;
use a separately reviewed fresh identifier for later preparation.

The private policy is fixed: development classification, hashing PoH calibrated
with `--hashes-per-tick auto`, zero inflation and zero selected fee/rent burns.
Three new identities, vote keys and stake keys are bootstrapped. A new disposable
system-owned reserve receives the remainder of exactly 1,000,000,000,000 native
base units. A probe counts all fixed allocations; the final genesis is audited
again and must total that exact budget. These units are synthetic. The reserve
is not a production bridge vault and has no funded origin backing.

The selected archive must match its standalone genesis and include its initial
slot-zero blocks. Two fresh directories receive bounded validated copies. On
each, the pinned ledger tool runs `verify --halt-at-slot 0 --no-snapshot
--print-bank-hash` with normal ledger verification. Its separate `shred-version
--no-snapshot` command internally defaults to slot 0; that subcommand does not
accept `--halt-at-slot`. Neither command skips PoH/transaction verification or
ignores the host file-limit check.

Both copies must report the same valid slot-zero bank hash and shred version.
The bank hash must differ from the genesis hash. The tool writes the exact
launcher manifest only after matching replays, complete inventory/accounting
and final bundle admission. It does not learn trusted launch pins from RPC.
Two replays on one host establish repeatability, not independent verification
or distributed consensus. No such real replay has passed on the current host.

After a real `prepared` result, independently review the retained outputs and
run the separate `consensus.py` admission and explicit private rehearsal from
[the launcher contract](CONSENSUS_REHEARSAL.md). Preparation cannot launch nodes.

## Evidence and limits

Thirteen preparation checks cover blocked/canonical hosts, read-only default,
commands, strict output parsing, exact budgets, disagreement, retained attempts
and redacted failures. A synthetic tool driver exercises the full orchestration
and real archive materialization; its simulated bank outputs are not real
replay evidence. Together with existing launcher/archive/host checks, 42 local
checks pass. Actual compiled-tool CLI discovery and blocked-host admissions are
recorded in [the scoped evidence](../evidence/mainnet-genesis-preparation.json).

An initial private CLI assertion incorrectly required a flag on `shred-version`
and is retained as failed. The source and assertion were corrected against the
pinned tool's actual help. It created no private genesis namespace or validator.

Real hashing genesis, bank replay, full-validator consensus/recovery, independent
operators/hosts, actual funded backing, custody and external security review
remain required before production. The canonical devnet and its fresh stability
run are separate and unchanged.
