# Solana Classic whitepaper verification

Version 0.4 is a dated draft for founder review that incorporates the latest cultural brief and Pump-first native-redemption direction. Local document checks passed. These checks do not accept an economic token launch, remote network, native mainnet or bridge.

## Deliverables

- `WHITEPAPER.md` is the editable source.
- `output/pdf/Solana_Classic_Whitepaper.pdf` is the 20 page A4 edition, with embedded fonts and 13 section bookmarks.
- `output/qa/verification.json` records final file hashes, page bounds, critical text checks, links and visual-review scope.
- `output/qa/contact-1.png` through `contact-4.png` preserve the full-document visual overview.
- `tools/build_pdf.py` is the local ReportLab authoring helper. It uses macOS Arial and Menlo font files; it is separate from the application runtime.

## Changes in this revision

The opening leads with the founder's reason, goal and intended future for creators and buyers. Version 0.4 adds the dated 27 July 2025 Yakovenko quote, cited directly to the primary X post verified by the lead through Chrome. Only 16 words are quoted. His loot-box comparison and $150 billion figure are attributed to him; the figure is not asserted as an independently verified industry metric. The public exchange provides a concrete cultural disagreement, without treating it as a majority poll or agreement among all founders. The cultural argument is the founder's interpretation, without a causal claim that Solana's wider agenda caused extraction. A new future-journey section describes proposed developer-wallet declarations, concentration and allocation views, fee dashboards, enforced versus voluntary unlock labels, auditable creator funding, participation tools, founding roles and measurable outcomes. Delivery phases and the limits of opt-in standards are explicit. No runtime ban or promise to eliminate scams is claimed.

SOC is described as one lifecycle: an original Pump.fun token on Solana, followed by planned native Classic SOC redeemable one-to-one in display units through a reviewed bridge. The candidate mechanism escrows original SOC before releasing native units from a protected preallocated reserve. The reverse requires native units to return to reserve before original escrow is unlocked. It does not treat an SPL mint operation as native issuance. Developer retained quantity and acquisition are unresolved; no arbitrary free Pump allocation is assumed. Pump's bonding curve and conditional PumpSwap migration are distinguished from future pools.

Conservation covers every native balance outside reserve, including bootstrap, developer, validator and programme balances. Separate fees, decimal conversion, burn treatment, exclusion of independent native inflation, replay protection, finality and distinct economic/security release gates are specified as requirements. No actual supply, allocation, reserve quantity, deployed address, price or return is invented.

The version 0.4 checkpoint records the fresh candidate genesis 7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon and API https://network-release-production.up.railway.app. Official Agave v3.0.14 plus the official Token-2022 v10.0.0 programme are running. The programme's on-chain bytes were checked against the official artifact. The remote SDK smoke check passed at 2026-10-13T05:29:17.715Z with seven action receipts: two test fundings, native TEST transfer, meme issuance and transfer, NFT issuance and transfer. Native balances and the NFT current owner were checked.

The preserved v4.3.0 failure and stopped earlier 8w compatibility probe remain distinct from the fresh candidate. No published release-candidate ledger was reset. The official Token-2022 release resolves the bundled programme's stricter-ABI metadata incompatibility. The verified two-phase model initializes inline metadata in Transaction A and performs supply issuance plus authority removal atomically in Transaction B. Browser, restart persistence, backup/restore, bounded load, human pilots and soak remain pending; no complete G0 through G7 gate or SOC economic launch is claimed.

## Review performed

All 20 pages were rendered with Poppler at 130 DPI and inspected through four contact sheets. The opening mission, primary quote, fresh remote checkpoint, runtime/programme records, verified issuance, conservation and fees, and references were also inspected at original render size. No clipping, overlapping text, missing glyphs or table-cell overflow was observed. Long tables repeat their headers across pages. The final render log was empty. Text extraction checked all pages against safe page bounds and confirmed critical status, economics, denomination, authority, gate and date language.

An independent reader reviewed the native-redemption model, the cultural argument and version 0.4's technical checkpoint. It found no unsupported launch, allocation, security, all-founder or community-majority claim. Its material suggestion was incorporated: all native balances outside reserve, including genesis/bootstrap balances, count as outstanding claims and require escrow backing before spending. The reserve is described as unreleased rather than unissued because it exists at genesis.

The official Token-2022 v10.0.0 release supports the documented compatibility fix; deployed bytes, commit and artifact hash are recorded with the actual proof. The historical claims remain grounded in Bitcoin Cash community history, Ethereum.org fork history and the Ethereum Classic genesis account. Anza's v4.3.0 release supports its upstream status, and official v3.0.14 source confirms a directory-operation fallback; neither establishes a successful deployment. Solana's official metadata, authority and account documentation supports the relevant technical distinctions. Current Pump programme, creation and fee documentation supports the initial venue mechanics. Ethereum.org bridge guidance supports general mechanism and risk categories, without suggesting that a bridge provider has been selected. Eighteen primary or first-party source URLs appear in the references; the frontend preview and experimental API origin are separate project links. The quote is sourced to the directly verified primary post; secondary news coverage was used as a cross-check, without importing community-majority or market-statistic claims.

## Remaining decisions

The running experimental candidate still needs browser and operating acceptance, persistence/recovery evidence, bounded load, active backups, alerts, external human testers and the candidate soak. Original SOC needs the founder's release/spending decision, developer acquisition and holdings disclosure, final metadata and fee policy. Native mainnet needs the protected reserve, fee and validator economics, and custody/governance decisions. The bridge needs a verifier model, implemented controls, independent review and recovery evidence. Additional pool venue, pair, funding and ownership remain unresolved.

Before publication as a live-network whitepaper, update the checkpoint from accepted evidence and regenerate the PDF. No external publication, token broadcast, bridge deployment or liquidity deposit was performed in this document task.
