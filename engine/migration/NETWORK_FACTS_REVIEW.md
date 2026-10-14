# Current devnet identity and executable programmes

The fixed-target, read-only `network-facts-review.mjs` reviews the existing
canonical devnet. It never generates keys, grants funds, signs, broadcasts or
controls a validator. Both runtime reads must match the original frozen
candidate. Failures are retained as separate reports, not overwritten.

The 14 October remote run confirmed the distinct genesis, valueless TEST
configuration, one project operator and disclosed persistent/reset policy.
Direct RPC health returned `ok`, Agave reported3.0.14, and finalized slots
advanced343799 to343807. This is a short liveness observation, not a capacity
benchmark, an independent consensus test or a new stability run.

A finalized snapshot at343800 verified the Token-2022 and associated-token
programme accounts are executable. Token-2022's Loader-v3 pointer matched its
derived ProgrammeData account. The exact506896 deployed ELF bytes matched
the official v10 artifact SHA256
`a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68`;
unused code capacity was zero. The associated-token programme's Loader-v2
ELF hash was recorded as an observation, not separately certified against
an upstream artifact.

The observed Token-2022 upgrade-authority option contains the system-program
address. It is not recorded as `None`, and this review does not assert
programme immutability or production upgrade/custody security. RPC responses
come through the project gateway; they are not independent operator evidence.

Eight local admission regressions reject wrong/public chain identities,
changed facts/runtime, stale or incomplete snapshots, executable/loader/pointer
mismatches, changed code or unused capacity, malformed RPC envelopes and
oversized responses. Their synthetic data does not replace the actual remote
result. Use pinned Node24:

```sh
node --test engine/migration/network-facts-review.test.mjs
node engine/migration/network-facts-review.mjs --ack read-only
```

`evidence/network-facts-current-individual-review.json` supports only
G1.01, G1.04 and G1.07 for the original frozen candidate. Other issuance,
gateway fault, quota, recovery, operator-handover and release requirements
remain separately reviewed. No mainnet, bridge activation, source-build
cutover or new-soak acceptance follows from these checks.
