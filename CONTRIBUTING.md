# Contributing

This repository contains the Solana Classic experimental SVM playground, its
gateway, SDK helpers, deployment scripts, live roadmap and release evidence.
Start with README.md and docs/CONTRACTS.md.

Use Node24 and the exact pnpm version pinned in package.json. Install with
`pnpm install --frozen-lockfile`. Keep credentials and runtime data in ignored
paths. Never run mutation tests against a public Solana real-money chain.

For changes to the main application, run the appropriate lint, type checking,
unit and integration checks. Browser or network claims need separately scoped
evidence. Fixtures and local tests cannot certify a hosted release. For the
standalone roadmap, run `node --test roadmap/lib/status.test.mjs`.

During a frozen stability run, prepare changes separately rather than deploying
them over the tested executable files. Changes to transaction execution,
identity, storage or recovery require a fresh full stability test. Presentation
changes still need targeted content and browser checks.

Use issues for reproducible bugs and focused proposals, then open a pull request
with the problem, resulting behavior and relevant validation. Keep dependency
versions pinned and preserve upstream notices. The root MIT license covers the
original project material; external dependencies retain their own licenses in
THIRD_PARTY_NOTICES.md and their upstream distributions.
