# Full validator hosting gate

The pinned source-built `agave-validator` refuses to open Blockstore unless the
process can raise its open-file limit to **1,000,000**. The current private
compiler container has a hard ceiling of **524,288**. The actual startup returned
`UnableToSetOpenFileDescriptorLimit`. The `--no-os-network-limits-test` flag does
not disable this separate storage requirement. The test-validator used for the
bridge rehearsal has a different storage option; its success does not pass this
full-validator gate.

Do not patch out the check or report consensus as accepted. Continue this
rehearsal on a Linux x86_64 host whose process/service/container limits permit
1,000,000 open files. Use the pinned source binaries and their verified hashes,
fresh private genesis/keys and the account audit; rerun consensus, runtime supply,
zero inflation and recovery there. The single-host rehearsal budget is at least
16 GB memory and room for three bounded ledgers plus binaries; it is not a
production sizing or performance claim.

The runner checks the hard limit before creating new keys/ledgers. Production
requires separate operators/hosts, backing and fee policy, reserve counters,
custody, monitoring/recovery and independent review. Provider selection and
account access remain an external requirement; no new account or paid server has
been provisioned by this work. The existing testnet and source migration image
are unchanged.
