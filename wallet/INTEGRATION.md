# W2 integration into the Classic site

W2 is a tested client implementation, with local mocked production-bundle QA. Public integration and live valueless testing are separate parent-owned steps. Do not describe the local evidence as a live mint, live ownership proof or production wallet audit.

## Reusable component

Import **default `ClassicWallet`** from `wallet/src/ClassicWallet.tsx`. A named export is also available. Do not import `wallet/src/main.tsx` into the site; it is the standalone auto-mounting entry.

```tsx
import WalletDrawer from '../../../wallet/src/WalletDrawer';

// Keep the component mounted once first opened.
{walletVisited ? <WalletDrawer open={walletOpen} onClose={closeWallet}/> : null}
```

The shell portals the persistent wallet into a nonmodal right dock. It reserves desktop space, leaves background links active and uses a full-width panel only on small screens. The overlay generator adds container-based copies of existing responsive site rules so the remaining page adapts to the reserved width. SPA navigation preserves the open state; direct `/wallet` opens over Home. Panel visibility persists separately from custody. No inert background, focus trap, backdrop or body scroll lock is used. Escape from inside the dock and its close button hide it. The original route stays behind the dock.

`ClassicWallet` remains usable standalone with `presentation="page"`; the dock uses `presentation="drawer"` with the fixed `/_network` gateway. Each mounted instance owns one session promise. Keep the site's existing upload-capable Playground intact.

Keys start in memory only. The optional Save flow uses the encrypted vault described in [README.md](README.md); refresh starts locked and requires the user's password. The panel close button preserves the session, Lock clears active keys while retaining the encrypted copy, and confirmed Remove deletes that browser copy. No key or password crosses URLs, events or component props. Browser storage receives only the authenticated encrypted recovery record and the nonsecret visibility preference.

`styles.css` scopes wallet controls under `.classic-wallet`; `drawer.css` separately owns the shell, desktop width reservation and responsive drawer layout. Existing font files and favicon bundle from source.

## Dependency resolution

Run `node wallet/tools/link-dependencies.mjs` using pinned Node 24 before building. This verifies exact installed SPL SDK versions and creates ignored symlinks **only inside wallet/node_modules**. It does not install packages or alter the root manifest/lockfile.

Because the lazy module lives outside the generated overlay directory, add Vite aliases to the already installed React instance:

- `/^react(\/.*)?$/` → absolute `apps/web/node_modules/react` path + `$1`.
- `/^react-dom(\/.*)?$/` → absolute `apps/web/node_modules/react-dom` path + `$1`.
- `buffer` → absolute `apps/web/node_modules/buffer/index.js`.
- `resolve.dedupe: ['react', 'react-dom']`.

The standalone wallet Vite config demonstrates these aliases. No new root dependencies are required.

## Same-origin gateway and media

The component accepts only the fixed historical gateway or exact `/_network` prefix; arbitrary RPC URLs are rejected. Public site integration must pass `apiBase: '/_network'`. The genesis remains pinned to the existing independent devnet, and protocol facts must still say `TEST`, no monetary value, online and matching genesis. Visible units say **tSOC**.

Required existing bounded adapter paths:

- `GET /_network/api/network`, `/api/status`, `/api/gallery?limit=12`, `/api/gallery/:mint`.
- `POST /_network/api/rpc`, `/api/faucet`, `/api/assets`, `/api/gallery`.
- For own artwork, `POST /_network/api/upload-assets`, `/api/upload-gallery`.

Upload bodies pass existing `AssetInput` plus raw bounded base64 `imageData`. PNG/JPG input is limited to 1 MB and 4 million pixels in the UI; MIME/signature/size guards run again before request. The existing image service remains authoritative for decoding/normalizing to PNG and storage limits.

Canonical metadata/image URIs embedded on-chain stay unchanged:

| Canonical store | Browser fetch mapping |
|---|---|
| `https://network-release-production.up.railway.app/assets/:hash/{metadata.json,image.svg}` | `/chain-assets/:hash/:file` |
| `https://image-assets-production.up.railway.app/assets/:hash/{metadata.json,image.png}` | `/uploaded-assets/:hash/:file` |

Both media adapters need fixed upstreams, GET-only exact hash/file allowlists, response-size/content-type bounds, no forwarded credentials and no redirects. `/_network` is for bounded JSON APIs; it does not need an arbitrary asset/RPC proxy. Wallet metadata checks require exact content-hash URI, image URI, mint/name/symbol/type/preset match and the expected store. The asset service's canonical URI is never replaced with the proxy URL on-chain.

## Actual owned inventory

The wallet reads **finalized raw Token-2022 accounts by its own public key**. It unpacks and checks program owner, token-account owner, initialization, positive amount and unsupported frozen/native states. It then checks the registered mint against supply, decimals, revoked mint/freeze/metadata authorities, metadata pointer and exact recorded name/symbol/URI. NFT owner disagreement and units above supply are rejected. A public gallery entry is never ownership evidence.

The first view scans at most 50 returned accounts and verifies at most 20 mint candidates. It clearly reports incompleteness and hides unverified/unsupported candidates. It is not a universal Metaplex/compressed NFT indexer. It requires only the gateway's existing permitted Token-2022/RPC methods; no live backend changes are needed.

## Signing and recovery

Native transfer protections remain: private memory key, fixed genesis, internal mutation lock, immutable wallet-issued single-use review, exact-message fee cap, simulation, final identity check and pending receipt before broadcast.

Creation additionally reviews account rent, uses a fresh private mint signer, issues supply and revokes authorities in one transaction, and checks exact-message fee/rent caps before signing and after simulation. A pending creation blocks replacement minting. **Resume same creation** only finalizes/verifies the recorded receipt and registers it; it never generates another mint or sends another transaction.

## Parent verification checklist

1. Build the site with the aliases and lazy kept-mounted route; add `/wallet` SPA rewrite and visible navigation.
2. Run local fixtures against the site build before deployment; check other pages retain styling and old playground uploads still work.
3. Review the concrete deployment/adapter configuration. Leave validator/gateway/frozen soak core unchanged.
4. After approval, run a small valueless live journey from `.net`: create account, faucet, preset/upload creation, finalized ownership, native transfer, route away/back and pending-resume behavior. Record live scope separately. Do not automate real funds, mainnet or bridge signing.
