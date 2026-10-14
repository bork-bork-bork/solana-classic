# Build on Solana Classic

Build for art, NFTs, memes and the people around them. The developer preview starts with the same open SVM tools used by Solana, connected to an independently initialized Classic network.

**Available today:** a valueless devnet, bounded HTTP JSON-RPC for Node and browser clients, a test faucet, Token-2022 minting code, explorer, immutable preset artwork and source examples. **Mainnet is not live.** Custom programs can be deployed through the tested HTTP deployer; see [Deploy your own programs](DEPLOY_PROGRAMS.md).

## Start in five commands

Use Node 24, Python 3 and pnpm 10.34.7. From a fresh clone:

```sh
git clone https://github.com/solana-classic/solana-classic.git
cd solana-classic
python3 scripts/pnpm.py install --frozen-lockfile
python3 scripts/pnpm.py exec tsx developers/examples/read.ts
python3 scripts/pnpm.py exec tsx developers/examples/mint.ts nft
```

The read example independently checks the published genesis and executable token programs before reading finalized progress. The mint example creates a disposable memory-only wallet, requests test funds, creates an NFT, removes issuance authorities using the existing atomic builder, waits for finalization and prints its explorer receipt. Use `meme` instead of `nft` for the fixed-supply meme example. Run each intentionally: another invocation creates a different asset; it is not recovery of the previous one. tSOC has no monetary value or entitlement to future SOC. Closing the process discards the keys.

[network.json](network.json) contains public connection parameters. Native decimals are 9; nft decimals are 0; the meme starter uses 6. `TEST` in raw network responses and `tSOC` on the site are the same devnet units. Mainnet addresses, genesis and economic parameters will be published separately; never reuse devnet identity as mainnet identity.

## What you can reuse

- [Client setup](client.ts): fixed preview endpoint, genesis checks and schema-checked requests.
- [Chain builders](../packages/chain/src/index.ts): atomic Token-2022 issuance, authority revocation, transfer, simulation and polling confirmation.
- [Classic Wallet](../wallet): original memory-only devnet wallet UI, exact review and receipt reconciliation. It is not yet a persistent production wallet or general wallet-adapter provider.
- [Artwork and gallery source](../infra/custom-domain): upload UI, discovery and finalized collector views.
- [Agave engine source](../engine/agave): pinned v3.0.14 source. Program addresses from Solana are not automatically deployed on Classic.

A mint starter is a starting point for a launchpad interface. A trading launchpad also needs its own tested sale/bonding-curve program, liquidity venue, treasury rules, indexing and reviewed signing interface. None of those are supplied by creating a token alone.

## RPC and access boundaries

Node clients use `https://rpc.solanaclassic.net`. The bounded gateway accepts one JSON-RPC request per call. Supported methods are defined in [packages/config](../packages/config/src/index.ts): genesis/health/version, blockhash/height/slot/time, balances/accounts/token reads, rent/fee estimates, simulation, send and signature/transaction polling. No WebSocket subscriptions, JSON-RPC batches, public admin methods, `requestAirdrop`, arbitrary upstreams or unrestricted account scanning. Use the HTTP test faucet, not `Connection.requestAirdrop`.

Current ceilings include 32 KB RPC request bodies, 2 MB responses, 32 concurrent upstream calls, 1,200 reads and 60 submissions per IP per minute. These are shared admission limits, not a capacity promise. The faucet grants 1 tSOC, at most 3 grants per wallet/day, 10 per IP/day and 1,000 globally/day. Handle pending receipts and rate limits; never repeatedly resubmit an uncertain mint.

Third-party browser apps can call the branded public RPC and API without credentials. Origin is not spoofed upstream; the bounded gateway retains its method, body, identity and quota checks. Generic SBF/Anchor build outputs can be deployed with the tested tool. Standard Solana CLI/Anchor deployment workflows need extra RPC methods and remain unsupported; WebSockets are not claimed.

For custom programs, [build, deploy and call a program on Classic devnet](DEPLOY_PROGRAMS.md). An isolated local Agave ledger is useful for earlier tests. Use the [official program deployment guide](https://solana.com/docs/programs/deploying) with your explicit loopback RPC and freshly generated local keys. For parity, the [verified Linux v3.0.14 installer manifest](../docs/agave-compatibility-release.json) and [Token-2022 v10 installer](../scripts/install-token-program.py) are available. The included macOS v4.3.0 tools are a different version; a passing local run does not establish v3.0.14 compatibility. Do not use `--clone` to copy accounts from public Solana into Classic.

## Join the launch cohort

[Submit a builder proposal](https://github.com/solana-classic/solana-classic/issues/new?template=builder.yml). Give the product, public code/demo, stage, required access and estimated development time. This creates a public GitHub issue when **you** submit it; listing does not imply funding or endorsement. The project directory currently lists first-party tools only.

See [the mainnet and builder launch sequence](MAINNET_LAUNCH.md). Builders need stable access and frozen parameters before a useful launch countdown can start. No mainnet date is announced yet.
