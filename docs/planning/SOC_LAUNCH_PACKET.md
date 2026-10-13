# SOC founder launch packet — prepared, unsigned

Prepared 13 October 2026. Name: **Solana Classic**. Symbol: **SOC**. Project: https://solana-classic-soc.vercel.app. Whitepaper: https://solana-classic-soc.vercel.app/whitepaper.pdf.

SOC is intended as the future network asset. The working experimental chain uses valueless TEST. There is no SOC mint, native mainnet, pool on Classic or redemption facility today.

## Proposed initial creation

Use Pump's ordinary SOL-paired `create_v2` route, with mayhem disabled. The official creation reference exposes a creation-only instruction separately from a purchase instruction; a create-and-buy wrapper is not necessary. This is documented instruction feasibility, not a successful live browser submission or simulated mainnet transaction. Before signing, inspect the actual UI transaction and reject any bundled purchase unless separately approved.

Current official documentation describes Token-2022 creation with six decimals. Do not substitute the example global reserves or supply in the README for current on-chain settings. Read and record actual global configuration, intended mint, program ownership, complete instruction list, fees and quoted wallet debit at the signing checkpoint.

Creator allocation is not a free arbitrary reserve. Any founder acquisition needs a stated amount, method, maximum spend, wallet disclosures and unlock policy. Initial curve trading and any later PumpSwap migration occur on Solana. A Classic pool needs its own deployment and liquidity funding.

Pump also documents an optional irreversible holder-rewards mode. Choosing it requires a separate decision about creator fee economics and distribution; the current proposal has no selected fee recipient or rewards mode. Deprecated cashback must remain disabled.

Sources checked 13 October 2026: [official creation reference](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md), [official program and migration reference](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md).

## Draft token metadata

Name: Solana Classic. Symbol: SOC. Description: “A focused home for memes and NFTs. SOC is intended to become Solana Classic's native network asset through a proposed 1:1 bridge. Mainnet and redemption are planned; TEST balances have no monetary value or conversion entitlement.”

The project and paper links above are available. Launch artwork and an immutable metadata URI still require selection and publication; no fictitious image URI is supplied. No signed transaction, real-wallet import or token purchase is part of this packet.

## Native supply conservation

Let total origin supply be S, origin units in finalized bridge escrow be E, spendable native units be N, and unused protected native reserve be R. At completed conversions, require **N = E** and **R = S − E**, after accounting for any explicitly disclosed burns. Economically spendable units are `(S − E) + N = S`, not S plus a second developer allocation.

Migration locks origin units before releasing matching native units. Return locks native units in the reserve before unlocking originals. In-flight operations need unique IDs and a durable state machine: requested → source finalized → destination released → completed; return operations mirror it. A timeout remains pending until reconciliation; never release twice. Decimal conversion must use exact integers with a defined dust rule.

Fees do not authorize hidden reserve issuance. Native gas paid to validators must be reconciled as transfers, and any native burns or inflation need an explicit conservation policy. Bridge custody, source/destination finality, replay domains, validator security, administrator powers, pauses, upgrades and two-way failure recovery require a separately reviewed implementation.

## Required signing checkpoint

Before a real launch, fill in founder holdings and acquisition, maximum total spend, public founder/treasury addresses, vesting, artwork, immutable metadata, current venue mode, fees and actual transaction details. The founder then gives a concrete release decision. The experimental network can pass its own release gates while these remain pending.
