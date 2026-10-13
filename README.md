# Solana Classic

**Bring back the fun.**

Solana Classic is an open-source blockchain project putting meme and NFT communities at the centre of its products and roadmap. We want the fast, affordable experience people associate with Solana, with clearer launch terms, accountable creators and a reason for communities to stay together after the first wave of hype.

**Our goal: make art, collecting and community feel worth coming back to—with clear terms and work that continues after launch.**

[Website](https://solanaclassic.net) · [Try the testnet](https://solanaclassic.net/playground) · [Live roadmap](https://solanaclassic.net/roadmap) · [Whitepaper](https://solanaclassic.net/whitepaper.pdf)

## Why we are building this

We came to Solana for the art, the jokes, the communities and the feeling that anyone could make something people cared about. Discovering a collection or a meme felt like joining something. We want that sense of fun and possibility to have a future.

We respect the engineering, the builders and the communities that made Solana possible. Its speed and accessible transaction costs gave people room to experiment. Solana Classic builds on that open-source work.

Our disagreement is about what deserves sustained attention. The Foundation's public-facing agenda includes [capital markets](https://solana.com/solutions/tokenization) and [AI agents](https://solana.com/solutions/ai). We believe the cultural community we belong to needs a home where art, NFTs and memes are the mission that sets the roadmap.

On 27 July 2025, Solana co-founder Anatoly Yakovenko wrote:

> “I’ve said this for years. Memecoins and NFTs are digital slop and have no intrinsic value.”

[Original post](https://x.com/toly/status/1949548737208181137) · [Contemporaneous reporting](https://decrypt.co/332035/solana-co-founder-calls-meme-coins-digital-slop-despite-token-fueled-surge)

He also compared them with mobile-game loot boxes. For us, that exchange made a cultural gap visible: the creativity, shared identity and relationships we came for deserve to be taken seriously. We want a place where those participants feel supported through the tools, funding priorities and continuing work around them.

That belief does not make every token valuable. It gives us a reason to build better tools and expect more from the people launching projects. **Our own products and ecosystem priorities will focus on art, NFTs, memes and their communities.** The [whitepaper](docs/whitepaper/WHITEPAPER.md#1-a-focused-home-for-memes-and-nfts) develops that founding argument.

## The frustrations we want to address

We are building for people who are tired of:

- **Being treated as exit liquidity.** Buyers take the risk while a launch can pay its creator through trading fees and sales of retained tokens. People want to understand those incentives before participating.
- **Hidden control.** It can be hard to tell which wallets belong to the team, how concentrated the supply is, what can be changed, or when retained tokens can be sold.
- **Promises disappearing after launch.** A new ticker attracts attention, then the promised work stops and the community is left waiting.
- **Culture being reduced to the next chart.** Artists need tools and an audience. Collectors and meme communities need places to participate when trading slows down.

Creator funding can support worthwhile work. For example, [Pump's fee documentation](https://pump.fun/docs/fees) explains how trades fund creators, the platform and liquidity providers. The question we want to make easier to answer is: **who gets paid, what do they control, and what are they delivering for the community?**

## What Bitcoin Cash and Ethereum Classic teach us

Blockchain communities have chosen different paths when they disagreed about priorities.

| Project | The disagreement | The priority its community chose |
| --- | --- | --- |
| [Bitcoin Cash](https://bitcoincash.org/) | Bitcoin's scaling debate led to a chain split in 2017. | Keep everyday electronic payments affordable through more on-chain capacity. |
| [Ethereum Classic](https://ethereum.org/ethereum-forks/#dao-fork) | Some participants rejected the ledger intervention following the DAO hack in 2016. | Continue the original chain without that intervention. |
| Solana Classic | We want memes and NFTs to have a consistent place at the centre of the roadmap. | Build around creators, collectors and communities, with understandable terms and visible accountability. |

The inspiration is a community choosing what its network should stand for. The technical histories are different: Bitcoin Cash and Ethereum Classic diverged from existing ledgers; Solana Classic starts with a fresh independent ledger using Solana's open-source engine. It does not copy Solana balances, transfer existing NFTs automatically, or give SOL holders a claim to SOC. This is an independent project with no affiliation to the Solana Foundation.

## The future we want people to see

Imagine arriving with an original image, a joke or a community idea. Making it should be straightforward. Finding people who care should be part of the experience. When you open a project page, its launch terms should be understandable: the creator's declared holdings, fees, unlock rules and what the funding has delivered.

Over time, that page could show new artwork, events, useful tools and fulfilled commitments. A creator could earn a reputation through continuing work. Collectors could follow the art and participate in a community that keeps giving them reasons to return.

The proposed tools and standards are:

- **Readable launch records:** supply, declared team wallets, retained holdings, how those holdings were acquired and any powers the team keeps.
- **Honest unlock information:** distinguish restrictions enforced on-chain from a team's promise to wait before selling.
- **Visible fees and funding:** named recipients, public spending records and updates connecting funding to delivered artwork, tools or community activity.
- **A lasting home for creative work:** approachable creation, NFT discovery and ways to follow what happens after launch.

These are future product goals. Our own planned SOC launch needs the same disclosures. **The change we are aiming for is concrete: easier creation, clearer control, accountable funding and communities with a life beyond their launch.** Progress should be judged by people creating, returning and fulfilling commitments.

Disclosure cannot reveal every undeclared wallet or guarantee a fair price. Focus alone cannot prevent scams. Our standards would apply to our own launch and discovery services; the underlying engine can still run other applications.

## What you can use today

A working experimental test network is live, operated by one project-controlled validator—the computer that verifies its transactions.

In the [playground](https://solana-classic-soc.vercel.app/playground), you can create a temporary test wallet, receive test units, create a demo meme token or NFT, transfer it, and inspect ownership and transaction records in the gallery and explorer. The wallet stays in browser memory; reloading loses access to it.

**TEST/tSOC balances and demo assets have no monetary value or right to conversion into SOC.** Production mainnet, the SOC token and the bridge are not live. Current build, test and release results—including failed or pending gates—are on the [live roadmap](https://solana-classic-soc.vercel.app/roadmap).

## How SOC is intended to work

SOC is intended to become the network token of Solana Classic. The proposed path is an initial token launch on Pump.fun on Solana, followed by native SOC on the independent production network and a reserve-backed bridge allowing one-to-one redemption between the two forms.

The aim is one economic supply: moving to native SOC requires backing from original tokens held in reserve. Mainnet, reserve protection, bridge security, fees and founder holdings still need implementation, published terms and review. Redemption is unavailable today. The [whitepaper](docs/whitepaper/WHITEPAPER.md) explains the proposed model.

## What is in this repository

The **full blockchain engine source is here**, alongside the website and backend. A normal clone includes [engine/agave](engine/agave); no separate engine checkout is required. Agave is the software used to run Solana-style validators and execute applications. Our imported v3.0.14 source currently has no project-specific engine changes.

The live test network uses verified official upstream binaries. Building and testing our own binaries is a separate release step tracked on the roadmap. Including source or compiling it does not approve a network switch.

| Folder | What it contains |
| --- | --- |
| [engine/agave](engine/agave) | Blockchain engine, validator, runtime, CLI and upstream tests |
| [engine/build](engine/build) | Our separate Linux source-build and isolated-test worker |
| [apps/web](apps/web) | Website, playground, gallery and explorer |
| [apps/api](apps/api) | Backend, test faucet and asset services |
| [packages](packages) | Shared transaction and network rules |
| [roadmap](roadmap) | Live progress page |
| [docs](docs) and [evidence](evidence) | Whitepaper, operating instructions and dated test results |

## Help build it

Try the playground, tell us what is confusing, challenge the whitepaper's assumptions, or contribute code. Artists and collectors can help define what a useful cultural home should actually do. Builders and reviewers can help make its claims checkable.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributions and [SECURITY.md](SECURITY.md) for vulnerability reporting.

<details>
<summary>Developer setup and operating details</summary>

Use Node 24 and pnpm 10.34.7. Install dependencies with `pnpm install --frozen-lockfile` and follow [CONTRIBUTING.md](CONTRIBUTING.md), [COMPATIBILITY.md](docs/COMPATIBILITY.md), [CONTRACTS.md](docs/CONTRACTS.md) and [OPERATIONS.md](docs/OPERATIONS.md) to configure a local test network.

```sh
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
node --test roadmap/lib/status.test.mjs roadmap/lib/engine-build.test.mjs
python3 engine/build/worker_test.py
```

The engine is a complete Git subtree source snapshot of upstream Agave v3.0.14. Exact commit, tree and license provenance are in [engine/upstream.json](engine/upstream.json). Upstream history is accessible through its recorded commit; our existing application history is retained. Engine build requirements are in [engine/agave/README.md](engine/agave/README.md).

Vercel serves the frontend and the main site's `/roadmap` route. Railway hosts the persistent test network and a separate compiler/test worker. The roadmap reads six fixed public status sources; it accepts no caller-selected upstream URL. Compiler artifacts and its fresh staging ledger use a dedicated volume. A completed isolated test does not certify a production migration or replace a full stability run.

During the current freeze, `solanaclassic.net` temporarily forwards to the verified Vercel app origin. Enabling the new browser origin on the testnet gateway belongs to the next tested application release.

During an active stability run, keep the tested source, runtime identity and served application files unchanged. Follow [HOSTED_QA.md](docs/HOSTED_QA.md) before operational changes. Preserve failed and interrupted attempts. Private keys, runtime ledgers, local tools and credentials remain ignored and must not enter source releases or frontend builds.

</details>

## Licenses

Our original project code and documents use the [MIT license](LICENSE). The imported Agave engine retains its [Apache 2.0 license](engine/agave/LICENSE) and upstream notices. Dependencies and fonts retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
