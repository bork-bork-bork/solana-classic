# QA checkpoint

70 local unit/integration fixture tests passed across store, identity and API controls. These tests do not establish chain execution or remote readiness. Current typecheck and lint pass; Vite build passes.

Interactive browser validation used the existing Chrome through CUA. Page identity and meaningful content verified; disposable wallet creation produced a real public key and survived SPA navigation to Gallery and back. Unconnected mint/faucet/transfer controls remain disabled, with no fake balances or receipts. Chrome wallet-extension injection errors originate from extension URLs, not this app; no actual wallet extension is used.

Desktop and mobile screenshots were inspected. CUA viewport screenshot scaling is inconsistent, and a DOM-layout inspection timed out in automatic approval review; isolated reproducible browser tests are still required. No remote browser mint/transfer proof, benchmark, recovery drill or24-hour soak is accepted yet.

Remote SDK mint/transfer proof passed on the fixed candidate, with official Token-2022v10 genesis code verified. Automated production browser acceptance uses a project-isolated Chromium runtime. The Browser plugin skill is unavailable in this session; CUAChrome was used first, but inconsistent viewport screenshots and approval timeout prevent reproducible layout assertions. The isolated test does not use the user Chrome profile.

Production-origin isolated Chromium journey passed at05:51:13.818UTC with actual TEST funding/transfer, fungible/NFT issuance/transfer, gallery ownership, responsive layouts, deep links, memory-only wallet loss and zero page errors. The exact browser SDK CORS header issue was fixed and three focused integration regressions passed (28 total integration cases).

Provider container/process restart passed at05:56:05.685UTC with exact recorded mint bytes, supply/authorities, ownership, asset hashes, gallery database and persistent faucet UUID/balance. This is not backup restore or hardware-host reboot.

The founder replaced external human pilot bookings with two independent agent pilots. Both passed through their own CUA tabs with one faucet claim each: pilot one verified a finalized meme transfer and exact recipient token balance, pilot two verified NFT transfer/gallery ownership and explorer refresh. No blocking findings. Pilot one noted the deliberately limited wallet explorer and generic transfer status wording. Actual evidence is labelled agent testing, not human research. Cold restore, monitoring/alert delivery, load, full24-hour soak, rollback and final regression still require evidence.
