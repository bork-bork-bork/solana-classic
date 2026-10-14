# Deploy your own programs on Classic devnet

Program deployment is available now through the identity-checked developer tool. It uses the supported HTTP RPC methods to upload a compiled SBF ELF, deploy it through the upgradeable loader and verify the finalized program, bytecode and your upgrade authority. Browser apps can use the branded public endpoints directly.

- RPC: **https://rpc.solanaclassic.net**
- API and faucet: **https://api.solanaclassic.net**
- Genesis: `7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon`
- Network: **Devnet**. tSOC has no monetary value. There is no mainnet mode in these tools.

## Build and deploy the included example

Start with the [repository setup](README.md). The counter is an original small C/SBF program with authority-checked state. It is a teaching example, not a launchpad or an audited financial program.

For the included counter, install platform-tools v1.53 through your local `cargo-build-sbf --install-only --tools-version v1.53`. The repository's installer can provide a verified Agave CLI archive; see [compatibility](../docs/COMPATIBILITY.md). Do not replace global tools just to follow these steps. `SC_PLATFORM_TOOLS` can point to an existing v1.53 installation. The counter build uses the included Agave v3.0.14 headers and the SBF v0 architecture.

```sh
python3 developers/programs/counter/build.py
python3 scripts/pnpm.py exec tsx developers/keygen.ts
python3 scripts/pnpm.py exec tsx developers/fund.ts
python3 scripts/pnpm.py exec tsx developers/deploy.ts --file .tools/developer-artifacts/classic_counter.so
python3 scripts/pnpm.py exec tsx developers/deploy.ts --file .tools/developer-artifacts/classic_counter.so --deploy
```

The first deployment command prints a review of the program, code hash, size, upgrade authority and estimated temporary rent/fees. The second intentionally sends it. Copy the returned **program public key** into this command:

```sh
python3 scripts/pnpm.py exec tsx developers/examples/counter.ts YOUR_PROGRAM_PUBLIC_KEY
```

That creates owned program state, calls the program, verifies the finalized increment and simulates rejection of a wrong signing authority. The deployer accepts a single SBF ELF up to 256,000 bytes; the included example is much smaller. Rent can exceed one faucet grant for larger programs. After a finalized grant, `developers/fund.ts --new-grant` intentionally requests another, within the existing daily quotas. Never start a new grant to resolve an uncertain receipt.

## Your own Rust or Anchor program

Use your chosen SVM toolchain to build its `.so`, targeting features supported by Agave3.0.14. A newer local compiler/version does not by itself establish runtime compatibility. Test on Classic devnet before claiming compatibility.

If your program embeds an ID (including Anchor's `declare_id!`), generate its development program key **before building**:

```sh
python3 scripts/pnpm.py exec tsx developers/keygen.ts --program my_launchpad
# Put the printed public key in your program's declare_id and development configuration.
# Build your program using its own pinned toolchain.
python3 scripts/pnpm.py exec tsx developers/deploy.ts --name my_launchpad --file path/to/my_launchpad.so
python3 scripts/pnpm.py exec tsx developers/deploy.ts --name my_launchpad --file path/to/my_launchpad.so --deploy
```

The same `--name` uses the same generated development program key. Every project owns its own generated authority; our examples do not use a shared signing service. All generated CLI keys/journals stay under ignored `.data/developers`, with restrictive file permissions. Keep them private and backed up; losing the authority means losing the ability to upgrade. These are development keys, never real wallets. Browser starter keys remain in memory only.

The standard `solana program deploy` and `anchor deploy` paths need additional RPC methods and are not advertised as supported today. Compile with your tools, then deploy the output with this tested HTTP path. Construct instructions with your SDK/IDL and send them through [the polling transaction helper](../packages/chain/src/index.ts) instead of assuming WebSocket confirmation. Program deployment and execution are available without unrestricted RPC scanning or administrative access.

## Upgrades and interrupted uploads

For an intentional upgrade, use the same name and generated authority:

```sh
python3 scripts/pnpm.py exec tsx developers/deploy.ts --name my_launchpad --file path/to/my_launchpad.so --upgrade --deploy
```

The tool checks the existing program's loader and on-chain upgrade authority before uploading anything. The initial allocation reserves twice the original code size; upgrades larger than that allocation are refused. Changing that allocation, retiring an authority and production upgrades need additional reviewed tooling.

A failed or interrupted command prints its private deployment-record path. Keep that record, all generated keys and the exact original binary. Inspect or resume it:

```sh
python3 scripts/pnpm.py exec tsx developers/deploy.ts --resume .data/developers/deployment-RECORD.json
python3 scripts/pnpm.py exec tsx developers/deploy.ts --resume .data/developers/deployment-RECORD.json --deploy
```

Resume checks the recorded signature before advancing. It refuses changed binary bytes, changed genesis or changed authority. It does not blindly create a second buffer/program or repeat an uncertain operation. If a transaction is known to have failed, preserve the record and diagnose it rather than replaying unchanged invalid instructions. Unfinished buffers retain test rent until separately closed; automatic cleanup is not claimed.

## Run the browser starter

```sh
python3 scripts/pnpm.py --filter @solana-classic/web exec vite build ../../developers/starter --config ../../developers/starter/vite.config.ts
python3 scripts/pnpm.py exec tsx developers/gateway.ts
```

Open `http://127.0.0.1:3910`. Paste your counter program ID, create a disposable test session, request tSOC, create program state and increment it. Requests go from that separate browser origin directly to `rpc.solanaclassic.net` and `api.solanaclassic.net`; the page polls HTTP for finalization. A pending signed receipt prevents a fresh second action and can be checked with **Check pending transaction**.

The optional local server also contains a bounded same-origin gateway for applications that want a backend. It binds loopback by default, accepts only a configured application origin and fixed API routes, checks genesis before writes, and forwards no credentials or fake Origin. Hosting your own instance requires explicit HTTPS origin/proxy configuration. No private raw-validator endpoint is exposed.

## Limits before mainnet

The public transport is HTTP-only, rejects batches and unknown methods, bounds requests/responses and preserves the frozen gateway's upstream quotas. Relay users share upstream IP quotas; a published RPC URL is not a throughput or faucet-capacity promise. `requestAirdrop`, WebSockets, general `getProgramAccounts` scanning, unrestricted CLI RPC and production wallet custody remain unavailable. Large-cohort funding/capacity is a separate post-stability release.

Build UI and reviewed program logic now. A mainnet launchpad also needs its sale/curve, fees, liquidity/migration venue, indexing, signing integration and operational/security reviews. Test accounts/program IDs do not become mainnet accounts automatically. Mainnet genesis, native SOC backing, production operators, launch date and bridge activation are separate decisions.
