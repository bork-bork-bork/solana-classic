# Individual source-candidate release review

The source-built devnet has completed its replacement full-day test and final
browser regression. Whole-release acceptance remains false. The historical
`evidence/acceptance-gates.json` selects the preceding API commit; its passed
requirements are not transferred to this candidate.

The separate [current review inventory](../../evidence/agave-source-acceptance-gates.json)
binds the exact source candidate, freeze, unchanged checklist and checksum-bound
individual proofs. It currently records 18 of 75 requirements reviewed:
G1.02, G2.02, G2.03, G2.04, G2.07, G2.08, G3.01, G4.03, G4.04, G5.01,
G5.08, G5.09, G6.01 through G6.05 and G7.04. The other 57 remain
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

The [operations individual review](../../evidence/agave-source-operations-individual-review.json)
adds eight requirements from the exact selected load, restart and negative-control
reports. All 200 load timings and distinct receipts were recalculated: p95 confirmed
latency was 3.313 seconds, p95 finalization was 15.350 seconds, and all operations
confirmed within 15 seconds. The restart preserved one sampled balance, 50 mint
records, 43 populated owner records and 100 immutable file URL/hash pairs. Separate
bounded controls recorded prohibited RPC rejection and an asset-admission 429.
That response does not identify the exhausted quota bucket or prove client-IP
attribution. These are retained observations; no workload, restart or abuse probe
was repeated.

The [cold-restore individual review](../../evidence/agave-source-recovery-individual-review.json)
adds G5.09 from the selected isolated recovery and its four checksum-bound
supporting reports. The records cover all 2,163 archived accounts, separately
reconciled vote fees, all database table hashes and 1,992 immutable files. Actual
HTTPS verification covered 617 gallery entries, 1,234 associated files and 452
NFT owners. This review does not restore anything or treat the old archive as
a backup of later transactions.

The [deployment individual review](../../evidence/agave-source-deployment-individual-review.json)
adds G5.08 by linking the actual source-runtime migration to the subsequent
restart and exact final freeze. The fresh deployment preserved the complete
recorded bank and application state, with named protocol changes and vote fees
accounted for. Its runtime matches the restart-before identity; restart-after
matches the final frozen identity. The earlier partial G5.08 finding remains
retained and is explicitly superseded by this review. No deployment or restart
was repeated, and hardware-host reboot is not claimed.

G5.07 and G5.12 remain unreviewed: healthy monitoring is not a complete
probe/delivery audit, and actual frontend rollback does not alone establish
preview environment separation and API freshness. The recovery review records
the missing evidence and the read-only next action for each.

This inventory is not consumed by the frozen legacy release evaluator and
cannot turn its result into a current-candidate pass. Preserve that evaluator,
its original manifest and all 45 frozen files. A future source-specific release
evaluation must bind this exact freeze/checklist, reject old-candidate proofs,
validate every selected proof and individually review all remaining requirements
before it can evaluate overall acceptance. An inventory count alone cannot do so.

Next review remaining recovery, monitoring, rollback and negative-control
proofs against the complete wording of each requirement. Do not replay finalized
operations or rerun the completed soak merely to obtain another checkbox.
Privacy/log coverage, adverse UI paths, historical deadline claims and operator
access acknowledgment must not be inferred from a successful happy-path journey.
Mainnet additionally requires suitable Linux hosting, actual full-validator
consensus/recovery, funded backing, custody, independent operators and security
review. No mainnet, bridge or overall release approval is supplied here.
