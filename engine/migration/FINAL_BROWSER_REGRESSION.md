# Final browser regression after the original soak

Two fresh Chromium sessions completed actual valueless journeys on 14 October
2026. The original frozen website and the current .net overlay have separate
reports and entry-bundle hashes. They are not interchangeable release candidates.

| Site | Actual journey | Evidence |
| --- | --- | --- |
| Original frozen website | One faucet grant, native transfer, preset meme/NFT issuance and transfer, finalized balances, NFT owner and Explorer receipt | `evidence/browser-final-frozen-20261014T180654050Z.json` |
| Current .net overlay | Same bounded journey, with an uploaded PNG NFT instead of the preset NFT | `evidence/browser-final-custom-20261014T181203133Z.json` |

Each run created two browser-memory wallets, requested one logical public faucet
grant, created two demo assets and finalized six distinct receipts. No keys were
imported, exported or retained; no transaction payloads or browser traces were
published. The recipient's native balance increased by exactly 10,000,000 test
base units. Meme transfers delivered 5,000,000 base units, and each NFT transfer
delivered exactly one unit. Supply, precision, token programme, metadata pointer,
mint/freeze/update authorities, immutable files and finalized owners were checked.

The full mint/transfer journeys ran at 1440 pixels. Explorer deep links and a
keyboard-focus smoke check ran at 360 pixels. This is not full mobile signing,
accessibility compliance, Safari/Firefox testing or human usability research.
Root-operated automated QA is not two new independent agent pilots. The original
two earlier agent pilots remain separately recorded.

Both runs found no page errors, unexpected API destinations, sensitive field
names in JSON requests or local/session storage writes. Those checks do not
establish a complete traffic/log privacy audit. Existing browser source still
requires independent review before any real-money signing use.

## Reproduce only when a new regression is needed

```sh
node --test engine/migration/final-browser-regression.test.mjs
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright-browsers \
  node engine/migration/final-browser-regression.mjs \
  --target frozen --ack valueless-devnet
PLAYWRIGHT_BROWSERS_PATH=.tools/playwright-browsers \
  node engine/migration/final-browser-regression.mjs \
  --target custom --ack valueless-devnet
```

Use pinned Node 24 and installed project Playwright. Browser plugin was not
available, so regular Playwright was used. The driver accepts only the two
fixed targets. It requires the original completed soak, original runtime boots,
known valueless genesis and all frozen source hashes before testing. It never
restarts a process, replaces a ledger, bypasses an admission limit, activates a
bridge or makes a purchase. If a faucet limit blocks the journey, retain that
failed report and do not bypass or reset the quota.

Each result is written exclusively to a dated public evidence filename. Failed
attempts are preserved. Browser keys disappear when the test contexts close.
Screenshots remain outside source and deployments in `/tmp`. The exact executed
driver is retained as non-executable text in
`evidence/browser-final-executed-driver.mjs.txt`; its hash and both report hashes
are in `evidence/browser-final-regression-review.json`.

The current driver adds an exact metadata/artwork-origin guard and rejects
credential-bearing metadata URLs. Seven unit checks pass, and all four observed
asset URLs match the stronger guard. The actual browser runs used the preceding
recorded driver; no extra live mint run is claimed for the subsequent guard.

## Release and migration scope

G7.01 and G7.04 are individually reviewed for the original frozen candidate,
with the earlier pilot records and actual anonymous final receipts. The .net
report supports its separate current overlay; it does not certify it through
the original soak. Full mobile acceptance, all other individual requirements,
operator handover and full release remain pending.

The canonical validator, genesis, boots, frozen source and original deadline
remain unchanged. These normal devnet transactions add new ledger state, so
the eventual approved migration must capture a fresh consistent backup after
them. Never use the old archive as the current migration baseline. The source
runtime switch and its new full-day test still need the concrete maintenance
decision and the reviewed migration sequence.
