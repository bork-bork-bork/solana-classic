# Live roadmap verification

Production: https://solana-classic-roadmap.vercel.app
Vercel deployment: dpl_3oTTuAJQosvcp11nqN2fs7dxkJhQ.

Scope is the separate read-only roadmap. The experimental network's all41frozen files and deployment/process identity remain unchanged. An actual full24hourtest is running, not accepted.

## Design fidelity ledger

Reference: concept.png (1435×1096), built-in image generator. Native1435×1096 screenshot: ../../evidence/roadmap-browser/native-cua.png, captured through Chrome CUA. Both images inspected together using view_image. Production HTML/status verified anonymous200, allfive live sources responding, exactcurrentgenesis/source/boots/freeze/run-start matching.22focused fault/security tests pass.

- Composition: same roomy header, large title, violet current-step band, ruled checklist, health/deadline rail and future columns. Real countdown extends the band and pushes future content below the firstviewport; scrolling retains the complete surface. This is a recorded functional extension.
- Typography: self-hosted Space Grotesk400/500/700, matching actual project brand,68px desktoptitle/32px subtitle/30px headings/16px rowtitles. Controls explicitly16px. Native screenshot shows no clipped primary text.
- Palette: existing paper#f7f5ee, ink#20211e, purple#6842ed; palevioletband, thinrules andgreenverifiedmarks maintained. No decorative gradient or imageoverlay introduced.
- Container/spacing:64px desktopgutters, open two-to-one checklist/rail split, no cardgrid. Original bottom plannedcolumns preserved. Mobile stacks naturally.
- Icons: circlebrandexistingcodeprimitive; smallgreenfilledcircle/check and purpleoutlinedrunningmarker; cleanSVGlinkarrow. No substituted rasterdecoration.
- Copy/data: exact headline/subtitle/nav/headings retained. Generated fabricated dates/chainID/marketplace/uptime/bridge descriptions corrected to real evidence and founder-approved scope. Whitepaper/unsignedpacket preparation is Prepared, not fullylaunchready. Passes/running/deadline are source-backed. Full list in DESIGN.md.
- Interaction: manualrefreshworks, a loadtestrow opens actual scope/timestamp/checksum. The page refreshed actualjourneycount3→4 without a page reload. Independent production QA covers mobile, refresh, evidence state andconsole; outcome recorded separately.

Above-the-fold copy diff: only the recorded actualdata corrections and required livecountdown/state extensions; no unapprovedmarketingheadline, eyebrow ornewproductclaim. No fixable material visual mismatch found in the native comparison. The complete implementation is faithfully verified against the accepted reference, with factual corrections and live-state extensions explicitly documented.

Browser method: ChromeCUA first, including nativeviewport screenshot, refresh andevidencerow; browsercontrol became unreliable when parallelChrome tabs were active. Responsive production QA uses project-isolated PlaywrightChromium as the safe fallback, withoutusercookies/walletextensions. Temporary rootChrome viewport was reset and user-facingroadmap tab markedasdeliverable.

Keyboard refresh initially lostfocus when the disabledbutton was reenabled. The roadmap-only client nowrestores focus only if the user had focused it andthebrowser droppedfocus toBODY; checklist summaryfocus also survives refresh. This required one isolatedroadmapredeploy. First incompleteQA attempts arepreserved under evidence/roadmap-browser/deployment-6R3-incomplete. A fixture-injected503 browserdiagnostic isclassified as a testfixture, not a productionnetworkoutage or applicationexception.

Final production regression passed11checks at2026-10-13T17:23:24.123Z on dpl_3oTTuAJQosvcp11nqN2fs7dxkJhQ. Exact1440desktop and360mobile have no overflow. Button andfocusedsummary retainkeyboardfocus across manual/natural30secondrefresh, expanded evidence staysopen and deliberateuserfocus moves arenot stolen. All5actualsources respond withbound currentcandidate/start/freeze. Client-only503 fixturemarksstale, expected503diagnosticclassified, successfulrefreshrestoresactualRunning. A client-onlyfuturecompleted-soakfixture correctlyshows Pending final review; it is not an actual soakpass. No applicationexceptions orunexpectedorigins. Latestfullscreenshots desktop-1440.png/mobile-360.png andtheconceptwere inspectedwithview_image; no materialvisualmismatch remains beyond documentedfunctional/factualextensions.
