# Mainnet launch with applications ready

A mainnet launch should open a usable ecosystem, with builders already able to test their products. The proposed minimum builder window is **21 days after the full developer preview is ready**. This is a planning recommendation, not an announced calendar date, grant programme or guarantee that any partner will ship.

## Sequence and acceptance

| Stage | Deliverable | Evidence required |
| --- | --- | --- |
| Available now | Node developer preview, network manifest, token/NFT examples, source, explorer and builder proposals | Actual finalized devnet receipts and clean-clone setup |
| Developer access release | Stable public developer RPC; required CLI/Anchor deployment methods; origin onboarding; appropriate faucet capacity; reset/version policy; deployable custom-program starter; wallet signing interface | Independent app deployment, program interaction, browser signing, limit/negative tests |
| Launch-date decision | Validator-capable hosting, multi-node consensus/recovery, independent operators, exact backed genesis/supply, token/bridge custody decisions and security review plan | Published readiness record with unresolved items; operator/founder release decision |
| T−21 or earlier | Announce the calendar date, freeze developer interfaces and publish signed/versioned mainnet genesis, chain parameters, program list and RPC/explorer URLs | Builders can simulate the same parameters on a staging network; no invented addresses |
| T−14 | App previews and integration week | Each team provides a working demo, source/ownership, required programmes and test receipts |
| T−7 | Feature freeze and launch rehearsal | Deploy/upgrade authority manifest, migration dry run, rollback/recovery plan, app security review and support contacts |
| T−2 | Go/no-go decision | Network, custody, bridge and launch-app gates pass; disclose any application that will miss launch |
| T0 | Mainnet opens; only ready applications are listed as live | Published mainnet identity, verified explorer receipts and operational monitoring |
| T+1 to T+7 | Observation and builder support | Incidents, recoveries and programme/version changes visible publicly |

The launch-date decision can precede the final security verdict, but it cannot hide a blocker. If a release gate fails, publish the changed date and reason rather than launch through it. Devnet tSOC, collectibles and balances do not migrate automatically or entitle holders to SOC.

## First application lanes

1. **Minting and community tools:** token creation, NFT drops, galleries and collector profiles reuse the current primitives. Fastest lane to begin now.
2. **Launchpads:** builders design and review their sale/bonding curve, fees, creator disclosures, custody and liquidity migration. A working mint UI is not a trading launchpad.
3. **NFT marketplaces:** require reviewed listing/escrow, settlement, fees and indexing; do not assume Metaplex contracts or marketplaces already exist here.
4. **Wallets and analytics:** require reviewed persistent custody/signing and stable indexing/feeds. The current wallet remains memory-only devnet software.

Projects need not wait for mainnet to develop their UI and local programmes. Shared-host and production-security checks remain separate from app development.

## Current critical path

The private full-validator rehearsal is blocked because the current host's open-file hard limit is 524,288 and pinned Agave requires 1,000,000. The existing single-operator devnet and successful private bridge round trip do not resolve this. See [the validator host gate](../docs/planning/VALIDATOR_HOST_GATE.md).

Before a concrete date: resolve hosting; verify full-validator consensus and recovery; appoint independent operators; decide exact SOC backing and genesis; finish bridge custody/recovery and independent security work. In parallel: ship the developer access release, collect proposed launch applications and test a fresh team onboarding. No paid host, partner commitment, production liquidity or audit has been arranged by this document.

## References for the launch pattern

The model is an inference from established developer infrastructure: [Monad's ecosystem directory](https://www.monad.xyz/ecosystem) pairs applications with developer resources; [Sui's production-readiness guide](https://www.docs.sui.io/develop/production-readiness) requires application security, key-management and operational checks; [Solana's deployment guide](https://solana.com/docs/programs/deploying) describes custom-RPC program deployment. These references do not establish a suitable date or security outcome for Classic.
