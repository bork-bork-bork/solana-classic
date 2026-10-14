# Backed bootstrap accounting

`bootstrap.mjs` is an offline rehearsal auditor. It counts every actual genesis
account and checks exact original/native units, reserve rent, precision slack
and proposed initial bridge counters. It cannot access a network, create keys,
write a ledger, set counters or activate mainnet. Declared backing is not proof
that any original SOC has been purchased or locked.

## Exact budget

Let `F = 10^(9 - originalDecimals)`, `S` be original mint supply in original
base units, `A` be every native unit outside the reserve, and `P` be protected
native units within the reserve (at least the vault's rent requirement).

The audited genesis must have total `G = S × F`. Its reserve is `R = G - A`.
With `L` original base units finalized in escrow for bootstrap:

```text
minimum L = ceil((A + P) / F)
bootstrap backing = L × F
backed native units still inside reserve = L × F - A
precision slack or additional backing = L × F - A - P
capacity for future original deposits = (S - L) × F
R = backed native units inside reserve + future-deposit capacity
```

The initial bootstrap backing already pays for the genesis allocations. It
must not also authorize a second native release. Extra backing/precision slack
is a protected tranche of the reserve, separate from capacity for new deposits.
The auditor conservatively includes all nonreserve lamports, including stake,
vote, feature, built-in, sysvar and other accounts. It does not assume these
accounts are immediately spendable or prove their withdrawal authorities.

Reserve rent matters: protecting it consumes native supply too. Backing only
the validator balances/stake would leave the planned full remaining bridge
capacity short by that structural reserve requirement. Native fee/rent burn
policy changes require a separate reviewed accounting model; this first
rehearsal auditor accepts zero inflation and zero burn only.

## Retained actual genesis projection

The pinned `solana-genesis` inventory contains 249 accounts and totals
1,000,000,000,000 native base units. All other accounts total 330,309,622,560;
the reserve is 669,690,377,440. For the **hypothetical** six-decimal origin budget
and eight-byte vault, minimum rent is 946,560 native base units. Minimum
prelocked backing is 330,310,570 original base units, leaving 880 native units of
precision slack. Backed units inside the reserve are 947,440; new-deposit
capacity is 669,689,430,000. These are synthetic rehearsal parameters, not real
SOC supply, source escrow or an approved production budget.

```sh
node --test mainnet/bootstrap.test.mjs mainnet/plan.test.mjs
node mainnet/bootstrap-fixture.mjs
node mainnet/bootstrap.mjs <public-rehearsal-accounting-input.json>
```

Thirteen bootstrap and seven planner checks pass. The fixture tool uses the
retained source-build inventory; it does not rerun genesis compilation or
consensus. See `evidence/mainnet-bootstrap-accounting.json` for source hashes
and both counter projections. Large unit totals remain exact integer strings.

## Counter and replay gate still open

Both initial bridge outstanding counters must match `L`, not zero. Source
bootstrap locks must be finalized and recorded as consumed bootstrap credits
before ordinary native claims open. A reviewed one-time initializer must bind
source events, original/native identities, mint, decimals, genesis inventory,
allocations, protected reserve tranches, epoch and custody/quorum policy. It
must reject a second bootstrap or ordinary release of the same backing events.

The existing SVM programme deliberately initializes outstanding at zero. This
auditor exposes that mismatch; it does not implement or bypass it. Supplying
matching numbers in an input only passes a **declared counter** comparison.
On-chain counter application, finalized backing, reserve custody, event
consumption and security review remain false release gates.

Reserve custody is also unresolved: the retained rehearsal reserve is a plain
system account controlled by a temporary fixture key, not an audited production
bridge vault. A future genesis/reserve design must make the protected tranches
enforceable before activation. Do not reuse the current devnet or the private
bridge fixtures as mainnet, or assign their balances any mainnet rights.
