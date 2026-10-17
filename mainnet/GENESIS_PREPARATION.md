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
manifests together, including `offline_process.py` and `cgroup_limits.py`. The pinned ledger tool was compiled from the complete
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

## Preserve the probe calibration

The budget probe alone uses `--hashes-per-tick auto`. The pinned Development
compiler measures the host and selects half its measured peak hash rate;
running that calibration twice can produce different genesis parameters.
Preparation now reads the probe auditor's positive u64 hash count and supplies
that exact numeric value to the final compiler. It checks the final audited
count and full PoH configuration against the probe before copying genesis into
the launch bundle or starting either slot-zero replay. A mismatch retains the
failed attempt and partial outputs. Host and validator PoH speed checks remain
unchanged; no sleep mode or performance-check bypass is introduced.

Three additional offline groups cover numeric bounds/types, the final command,
and changed final PoH reports. The synthetic orchestration driver verifies one
calibration followed by numeric selection, retained refusal before bundle copy
or replay, and the successful two-replay path. All 20 focused checks pass; the
full package runs 149 checks locally with 148 passing and one Linux-only check
skipped. These are supplied tool responses and disposable files, not compiled
genesis or real replay evidence. See [the local calibration review](../evidence/mainnet-preparation-poh-binding-local.json).

This removes one source of parameter drift within the existing preparer. It
does not integrate the reserve-byte adapter, prove that every other account or
non-account parameter is unchanged, or reuse a retained genesis/key set. Fresh
compiled genesis, complete byte comparison and actual strict replays still need
an admitted Linux host and a new reviewed attempt.

## Empty synthetic reserve admission

Before copying the final genesis or invoking either replay, preparation now
requires the selected reserve to have an integer data length of zero and an
explicit false executable flag, in addition to its exact address, System owner
and balance. Previously the latter three fields alone admitted a nonempty or
executable reserve in a supplied audit report.

One new orchestration regression covers nine invalid data-length/flag variants.
All nine reproduced the previous acceptance; each now retains a failed attempt
before bundle genesis, manifest or ledger-tool invocation. The normal empty
reserve still completes the existing synthetic two-replay driver. All 21 focused
checks pass; the offline package runs 150 checks locally, with 149 passing and
one existing Linux-only skip. These tests use supplied tool responses and
disposable files, not compiled genesis or real ledger replay. Full account-byte
comparison, reserve-byte adapter integration and an admitted Linux host remain
separate requirements. See [the reserve admission review](../evidence/mainnet-preparation-reserve-shape-local.json).

## Bounded offline tools and cancellation

Each pinned tool now runs in its own process group with a fixed timeout,
4 MiB stdout limit and 8 MiB private stderr limit. Both streams are drained
while it runs. A timeout, output overflow, cancellation or other exceptional
exit kills that owned group and reaps its direct child before the failed
preparation result is saved. A descendant retaining a pipe cannot silently
outlive the timeout. Cleanup never targets an unrelated process or service.
The attempt, partial keys, ledgers and private diagnostic files remain retained.

The default admission path still starts no process. Ten local lifecycle checks
use disposable Python processes, including actual timeouts, overflow and
inherited-pipe descendants. They do not execute the compiled genesis or ledger
tools. The current package also passed all52checks on the private Linux compiler
host. The helper executed checksum-verified keygen, genesis and ledger-tool
help commands, with all six selected artifacts unchanged and zero validators
before/after. Earlier provider DNS dispatch failures remain retained. This
verifies process control, not genesis compilation, replay or host admission.
See [the initial local evidence](../evidence/mainnet-offline-process.json) and
[the completed Linux verification](../evidence/mainnet-offline-process-linux.json).

## Tool identity checks during preparation

Initial artifact admission and every later offline invocation use the same
bounded regular-file fingerprint as host admission. Each read checks the exact
reviewed length, digest and executable permission, refuses symlinks and special
files, and rejects file identity or metadata changes observed during hashing.
Failures retain the preparation attempt and report a path-free failure code.
The caller does not launch the tool after a failed check.

Four additional local regression groups cover artifact replacement during a
read, a FIFO without a writer, invalid file types and permissions, and runtime
changes after host admission but before the first tool invocation. The complete
synthetic preparation driver still exercises both replay steps. These checks
are not compiled-tool or consensus evidence. The binary directory must remain
under trusted operator control: fingerprinting does not atomically bind the
later path-based process execution to the checked descriptor.

## Final bundle inspection tool admission

The bundle checker also uses the bounded executable fingerprint before running
its selected genesis auditor or keygen public-key inspection. Previously this
helper hashed the full file before checking its length, and could accept a
same-byte replacement during that read. Wrong lengths now refuse before opening;
changed file identity, permissions or bytes refuse before the process helper.
Read failures use a path-free error. Existing output limits, timeouts and
check-only behavior are unchanged.

Four new fixture groups cover read ordering, same-byte replacement,
non-executable files and sanitized I/O failure. All ten focused checks pass;
the complete offline preparation package runs 146 checks locally, with 145
passing and the existing Linux-only process check skipped. These are disposable
file/process tests, not compiled-tool execution or a newly admitted host. The
later path-based execution still requires trusted control of the binary
directory. See [the scoped result](../evidence/mainnet-bundle-tool-fingerprint-local.json).

## Evidence and limits

The original thirteen preparation checks cover blocked/canonical hosts, read-only default,
commands, strict output parsing, exact budgets, disagreement, retained attempts
and redacted failures. A synthetic tool driver exercises the full orchestration
and real archive materialization; its simulated bank outputs are not real
replay evidence. Together with the ten process lifecycle checks and existing
launcher/archive/host checks, 52 local checks passed at that initial review. Historical preparation
evidence retains its original counts and source hashes. Actual compiled-tool CLI discovery and blocked-host admissions are
recorded in [the scoped evidence](../evidence/mainnet-genesis-preparation.json).

An initial private CLI assertion incorrectly required a flag on `shred-version`
and is retained as failed. The source and assertion were corrected against the
pinned tool's actual help. It created no private genesis namespace or validator.

Real hashing genesis, bank replay, full-validator consensus/recovery, independent
operators/hosts, actual funded backing, custody and external security review
remain required before production. The canonical devnet and its fresh stability
run are separate and unchanged.
