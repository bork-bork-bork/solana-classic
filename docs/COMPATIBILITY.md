# Runtime compatibility record

Pinned Node24/pnpm10 and JavaScript versions are in the dependency manifests and frozen lockfile. TypeScript5.9.3 satisfies the selected SDK codecs and typescript-eslint. Optional bigint/WebSocket native acceleration falls back to JavaScript; the app polls HTTP.

Official Agave4.3.0 archives were verified before extraction. An earlier macOS download mismatch was rejected and retried; the accepted archives/binaries have separate integrity evidence. A local emulated x86 Linux container passed SDK/SQLite but lacks AVX, so it did not establish validator execution.

Railway's AVX2-capable host rejected Agave4.3.0's mandatory io_uring setup (OS error38). The retained first volume is a failed compatibility probe. Official Agave3.0.14 provides the portable I/O path. Its bundled Token-2022 exposed a documented metadata realloc bug. The retained second probe is a different genesis and does not identify the release candidate.

The active fresh candidate runs official Agave3.0.14 and the checksum-verified official Token-2022 program v10.0.0, which fixes that metadata bug. Startup verifies actual on-chain program bytes against the official archive. Full commits, URLs, sizes and SHA256 digests are recorded in agave-compatibility-release.json and token-program-release.json. No custom program or weakened runtime check substitutes for that proof.

Active API: https://network-release-production.up.railway.app. Canonical genesis: 7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon. Seven remote SDK actions passed at 2026-10-13T05:29:17.715Z, including native transfer, fungible issuance/transfer and NFT issuance/ownership transfer. A subsequent production redeploy preserved the genesis. Browser, full persistence/recovery, load, pilot and soak are separate checks; SDK proof alone does not pass the release gates.
