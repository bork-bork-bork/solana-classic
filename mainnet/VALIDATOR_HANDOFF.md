# Validator rehearsal handoff

The next network milestone is a genuine three-validator Agave rehearsal on a
capable Linux host. The canonical devnet and its ongoing stability test stay
untouched. A source-built test-validator and private bridge tests cannot pass
this milestone. No mainnet activation or real SOC movement is authorized here.

## Host required now

Use Linux x86_64 with a process hard open-file limit of at least1,000,000.
The private rehearsal admission profile also requires at least4 effective CPU
cores,16 GiB effective memory and16 GiB free rehearsal storage. These are bounded
rehearsal admission floors, not production sizing or performance promises.
Memory and CPU must include container limits, not only the physical host.

The existing compiler container fails the open-file requirement. Adding storage
or replacing its test-validator binary does not resolve that requirement. Do
not patch the runtime check, lower the requirement, change security policy or
reuse the devnet volume. A suitable host and its authorized operator access are
required before three full validators can be accepted. No server was ordered.

## Read-only first command

Transfer or build the reviewed public binaries from the pinned repository source.
Their exact digests and sizes are embedded in `host-preflight.py`, selected from
`evidence/mainnet-validator-rehearsal.json`. Do not copy operator private keys
from the devnet or any bridge fixture. On the intended private host run:

```sh
python3 mainnet/host-preflight.py \
  --binary-directory <reviewed-binary-directory> \
  --storage-root <existing-private-rehearsal-storage>
```

Exit0 means only that this host preflight permits fresh private preparation.
Exit78 is a blocking requirement. The command never creates keys or ledgers,
changes limits, starts programmes, uses a network or prints supplied paths.
A passing report does not start a validator or prove consensus/production safety.
Keep the result with the chosen host's operator record; do not publish private
addresses, machine identity, login details or local filesystem paths.

## Execution sequence after host admission

1. Review the fresh rehearsal namespace, exact binaries/source, no existing
   writer, private network boundaries and a bounded resource budget.
2. Prepare three new identity/vote/stake key sets and fresh private genesis.
   Retain any failed attempt; never reset or repurpose earlier ledgers.
3. Reconcile every generated genesis account against the exact synthetic budget.
   Verify no inflation, selected fees/burns, reserve custody and precision.
4. Run actual `agave-validator` processes with their normal host/network checks.
   The historical runner contains private probe flags that skip checks. It is
   evidence of an earlier failed attempt, not a production launch command.
   The new `consensus.py` package keeps those checks enabled and requires a
   separately reviewed hashing genesis and slot-zero bank/shred pins. See
   [its input and execution contract](CONSENSUS_REHEARSAL.md).
5. Confirm all three vote accounts participate, the same genesis and finalized
   progression agree across nodes, runtime supply matches the audited inventory,
   and native/token/program execution works. Record real results, not elapsed time.
6. Test loss of one node, quorum limits, restart, recovery and cold restoration.
   Separate same-host consensus proof from independent operator/host readiness.

## Monetary and production gates

The real origin mint, precision, supply and backing remain separate from this
synthetic rehearsal. Every spendable genesis allocation, stake and protected
reserve unit needs actual backing. The current sample reserve and genesis
budget cannot be promoted unchanged into a production bridge.

Before mainnet: accepted full-validator consensus/recovery, independent
operators, approved supply/fees/incentives and funded backing, reviewed reserve
custody/upgrades and bridge signers, complete pending-event/recovery treatment,
external security review, builder rehearsal and an explicit release decision.
A successful devnet24-hour test alone does not satisfy these gates or announce
a mainnet date.
