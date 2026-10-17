# Individual source-candidate release review

The source-built devnet has completed its replacement full-day test and final
browser regression. Whole-release acceptance remains false. The historical
`evidence/acceptance-gates.json` selects the preceding API commit; its passed
requirements are not transferred to this candidate.

The separate [current review inventory](../../evidence/agave-source-acceptance-gates.json)
binds the exact source candidate, freeze, unchanged checklist and checksum-bound
individual proof. It currently records eight of 75 requirements reviewed:
G1.02, G2.02, G2.03, G2.04, G2.08, G3.01, G4.03 and G7.04. The other 67 remain
unreviewed in this inventory, including the derived whole-release check. Missing
attestations do not necessarily mean functionality failed; they mean the
requirement has not been individually accepted for this candidate.

The [browser individual review](../../evidence/agave-source-browser-individual-review.json)
uses the two frozen-origin profiles for candidate acceptance. The two branded
profiles remain separately labelled supplemental coverage. All four raw report
hashes and selected public fields were checked, together with complete runtime
identity before and after, frozen frontend entry hashes and the retained
executed-driver assertions. No new browser session or transaction was started.

The review covers native transfer, fungible and NFT issuance/transfers,
immutable authorities, the actual browser journey, chain-checked gallery
ownership and anonymous HTTPS frontend/deep-link/metadata access. Supply,
balance and authority conclusions rely on the retained successful driver
assertions: these reports do not contain full raw RPC replies or supply an
independent transaction replay. Failed attempts remain failed and retained.

This inventory is not consumed by the frozen legacy release evaluator and
cannot turn its result into a current-candidate pass. Preserve that evaluator,
its original manifest and all 45 frozen files. A future source-specific release
evaluation must bind this exact freeze/checklist, reject old-candidate proofs,
validate every selected proof and individually review all remaining requirements
before it can evaluate overall acceptance. An inventory count alone cannot do so.

Next review retained load, recovery, monitoring, rollback and negative-control
proofs against the complete wording of each requirement. Do not replay finalized
operations or rerun the completed soak merely to obtain another checkbox.
Privacy/log coverage, adverse UI paths, historical deadline claims and operator
access acknowledgment must not be inferred from a successful happy-path journey.
Mainnet additionally requires suitable Linux hosting, actual full-validator
consensus/recovery, funded backing, custody, independent operators and security
review. No mainnet, bridge or overall release approval is supplied here.
