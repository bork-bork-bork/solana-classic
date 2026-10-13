# Solana Classic Whitepaper

## A focused SVM home for memes and NFTs

**Solana Classic / SOC**  
**Draft for founder review | Version 0.4 | 13 October 2026**

**Open to everyone. Built for memes and NFTs.**

Solana Classic is being built to put memes, NFTs and the people around them at the centre of a chain's identity. The goal is a home where artists can experiment, communities can form around things they care about, and buyers can participate with a clear view of who controls an asset and where money goes. Memes and digital art are ways people recognize one another and build a shared culture. They deserve product decisions made for them.

The founder believes that the early meme and NFT community was central to Solana's appeal, and sees a cultural rift between leadership priorities and that community. The concern goes beyond branding: when developers have more information, earn fees and control large positions while buyers carry poorly explained risks, participation can feel like extraction. We believe dispersed attention and weak standards left room for bad actors to extract value while providing little lasting work. That is the founding interpretation, not a proven causal account of Solana's history.

The response is a focused ecosystem with understandable creation tools, visible developer holdings, clear unlock rules, inspectable fees and funding that can be traced back to creator activity. Buyers should be treated as participants in that ecosystem. The project will judge progress by completed creation journeys, returning participants, better disclosure and delivered creative work. A token price is not evidence that this mission is working.

The first deliverable is a six-day experimental playground: create a disposable test wallet, receive valueless TEST, issue a demo meme asset, mint a demo NFT and transfer it with visible chain receipts. The design uses an independently initialized Agave ledger and one founder-operated validator. The remote script journey has passed; browser and operating gates remain pending. The larger product mechanisms and economic network are later phases. **The intended SOC lifecycle starts with a Pump.fun launch on Solana and later adds native Classic SOC redeemable one-to-one for the original token in display units.** The token and bridge have not launched, and redemption is unavailable until its own implementation and review pass.

### Evidence checkpoint

The implementation began on **13 October 2026 at 03:00:54 UTC**. A frontend preview is live at [solana-classic-soc.vercel.app](https://solana-classic-soc.vercel.app). Official **Agave v3.0.14 and the official Token-2022 v10.0.0 programme** are running on a fresh Railway candidate, with remote genesis `7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon`. The deployed Token-2022 bytes have been checked against the downloaded official artifact.

The remote SDK smoke check **passed on 13 October 2026 at 05:29:17.715 UTC**, recording seven action receipts: two test fundings, a native TEST transfer, meme issuance and transfer, and NFT issuance and transfer. It checked native balances and the NFT's current holder. This is actual chain execution, with signatures recorded in `evidence/chain-smoke-remote.json`.

Browser journeys, restart persistence, backup/restore, bounded load, external testers and the candidate soak still need acceptance. Earlier probes were stopped and retained: the v4.3.0 attempt failed on mandatory `io_uring`, and the earlier `8w` candidate exposed a bundled Token-2022 compatibility defect. The new candidate uses the official programme fix; no published release-candidate ledger was reset. The Pump-origin SOC token, native mainnet, bridge and SOC market have not launched. No complete G0 through G7 gate is claimed at this checkpoint.

Descriptions below distinguish **selected design**, **release requirements** and **later proposals**. They are not claims that those features have already passed acceptance. This checkpoint must be revised from evidence before publication as a live-network whitepaper.

## 1 A focused home for memes and NFTs

For the founder, Solana's appeal has always included the people around it: artists experimenting in public, communities forming around images and jokes, and small projects finding an audience without first becoming institutions. Solana's own December 2021 community update records NFT projects, fan communities and marketplaces alongside financial applications. That record supports the importance of culture in the ecosystem; it also shows that Solana was never exclusively an NFT network. [Solana Foundation community update](https://solana.com/news/december-2021-community-update) [1]

Solana now explicitly presents tokenized capital markets and AI as areas of development. Its tokenization material covers equities, debt and institutional tools; its AI material covers agents, compute and related applications. These are facts about the breadth of its stated agenda. They do not establish that memes or NFTs have disappeared, or that any group has been displaced. [Solana tokenization](https://solana.com/solutions/tokenization) [2], [Solana AI](https://solana.com/solutions/ai) [3]

### A public cultural disagreement

On 27 July 2025, Solana co-founder Anatoly Yakovenko posted the following during a public exchange with Base creator Jesse Pollak:

> "I’ve said this for years. Memecoins and NFTs are digital slop and have no intrinsic value."

In the same post, Yakovenko compared them with mobile-game loot boxes and cited $150 billion in annual mobile-gaming spending. That number was part of his comparison, not an independently established market estimate in this whitepaper. The exchange included Pollak defending the fundamental value of content and creators. [Yakovenko's 27 July 2025 post](https://x.com/toly/status/1949548737208181137) [17]

For the community Solana Classic belongs to, that language captures a cultural disagreement: are memes and NFTs disposable attention products, or a form of shared identity and creative participation worth building around? We see value in the people, work and relationships that can form around them. That belief does not mean every token or image deserves a price, and it does not excuse manipulation. It means creators and buyers deserve tools and standards that take their participation seriously.

One exchange does not establish what every founder believes or what a majority of the community wants. It does explain a reason for this project's choice. We see a cultural rift between leadership priorities and the meme and NFT community we belong to. We believe dispersed attention and weak standards left room for extraction. We are building focus and accountability: declared holdings, clear unlock rules, inspectable fees and evidence that creative commitments are fulfilled.

This is an argument about priorities within a general-purpose network, not a claim that Solana became general purpose in 2025. Its earlier ecosystem already included financial applications alongside NFTs. Solana Classic's response is to make memes and NFTs determine its own roadmap, first user journey and visible identity. The thesis does not require institutional finance or AI to be illegitimate; it requires consistent choices about who these products serve.

For this project, a launch succeeds culturally when people can understand its terms, take part in its community and see useful work continue after the first burst of attention. Developers should show what they retain, how they obtained it, what they can change and how fees are used. Buyers should be able to inspect those facts before choosing to participate. That would not remove market risk, but it would make the relationship between builders and their community more legible.

The first release makes that purpose concrete through four original geometric artwork presets, simple asset creation, a gallery that verifies chain state and receipts that let participants inspect what happened. The project will learn whether people complete these journeys and choose to return. A successful transaction proves execution. Returning creators and their feedback would provide evidence for a cultural home. Neither proves that an independent production chain is necessary.

### Cultural focus and general purpose execution

The focus applies to project-owned products, curation and development effort. It does not add a runtime rule that classifies and bans stock, agent or other transactions. Agave's SVM remains general purpose. A subjective transaction filter would create a separate engineering and governance problem and is outside this programme.

The public gateway still enforces method, size and rate limits, and the app only exposes its supported playground actions. Those controls protect the service and keep the pilot bounded; they are not a claim that the runtime can determine an application's cultural meaning. The founder also controls the website, gallery registry and access infrastructure. A curated interface must not be described as a decentralized guarantee of inclusion. "Open to everyone" states the intended invitation, subject to disclosed service limits and availability.

## 2 The future participants should be able to see

### A creator journey with public terms

Imagine a creator arriving with an original image and a community idea. A future creation flow helps them describe the work, choose the asset structure and publish a readable launch record. The record shows supply, declared developer and treasury wallets, what those wallets hold, how those holdings were acquired, any unlock schedule, retained powers and fee recipients. The creator can explain why a retained balance exists and how it will support the work. That explanation appears beside the on-chain facts rather than in a thread buyers may never find.

The creator's page then connects the work to its holders and the activity it funds: new artwork, community events, tools or another disclosed creative project. Participants can inspect receipts for spending from public funding wallets and read reports for expenses that happen outside the chain. A creator's reputation can grow through fulfilled commitments and continued work, with evidence that survives a promotional cycle.

This is a proposed product direction. The six-day playground design is limited to four fixed geometric presets and valueless demo issuance. Custom artwork, public launch records, funding dashboards and community workflows require later implementation. Their value will be tested with creators before the project commits to a production market.

### A buyer journey with visible control

A buyer opens a future asset page and sees the art first, then a compact explanation of the launch. A distribution view shows concentrated holdings and groups addresses that the developer has publicly declared as controlled by the same party. A fee view identifies recipients and spending activity. An unlock view shows what can move today and what is restricted by a reviewed on-chain programme. If an unlock schedule is only a promise, the page labels it as such.

The buyer can follow the work, ask about a missing disclosure, inspect an allocation or join a published community activity. Proposed participation tools include feedback on creator projects and transparent processes for selecting funded work. These are community roles to design and test; buying SOC or an NFT does not automatically grant a legally binding vote, ownership interest or payout through this whitepaper.

The purpose is to give people a better basis for a decision and a reason to remain involved after a transaction. No interface can know every address a person controls. Disclosed wallet groups and concentration signals must therefore identify their coverage and uncertainty. A missing disclosure should remain visible rather than be replaced with an invented assurance that a launch is fair.

### Mechanisms that could make the culture durable

The proposed launch standard starts with a signed public declaration of developer-controlled wallets, retained quantities, acquisition method, fee policy and unlock terms. Where control can be demonstrated with a signature, the product can verify the declared relationship. It cannot prove the absence of undeclared wallets. Distribution views should show observable balances and named control groups while avoiding claims about unknown owners.

An allocation dashboard should connect supply and holdings to the relevant mint or native ledger, with an update time and links to the underlying records. Unlock controls should distinguish restrictions enforced by a chosen, reviewed programme from schedules that depend on a person keeping a promise. The standard's admission policy can require those disclosures for project-owned discovery and launch surfaces. It does not make the underlying SVM refuse every transaction outside the standard.

An auditable creator-funding programme would publish its funding source, decision process, recipient addresses, spending records and delivered outputs. Community feedback could inform which creative projects receive support under a disclosed process. Revenue and expenditure must remain separate from token price, and operating costs need a funded plan. The programme cannot spend fees that have not been earned or imply that holders are owed its income.

Together, these mechanisms define "fairer" in operational terms: clearer holdings, known controls, understandable fees, visible commitments and evidence of delivery. They can make extraction harder to hide within the project's own surfaces. Focus alone cannot eliminate scams, hidden coordination or abusive projects. Opt-in standards cannot bind applications that choose not to participate, and the runtime remains general purpose. The project must earn trust through what its own products verify and disclose.

### Delivery phases

| Phase | Concrete product outcome | Evidence to seek |
| --- | --- | --- |
| Six-day TEST experiment | Disposable wallet, faucet, four presets, meme/NFT issuance, transfer, verified gallery and receipts | Real chain journeys, persistence and recovery, external pilot and candidate soak |
| Creator and buyer pilot | Prototype public launch records, declared wallet groups, allocation and fee views, and clear unlock labels | Can users explain supply/control; disclosures match their cited records; creators can complete and maintain them |
| Community standards and funding | Adopted admission terms, reviewed controls where needed, published funding decisions and spending reports | Coverage of launch disclosures; verified restrictions; delivered work; unresolved gaps made visible |
| Native mainnet and redemption | Protected SOC reserve, one-to-one bridge, reviewed wallets and defined market infrastructure | Monetary conservation, security review, two-way settlement and funded operation |

The later phases have no promised delivery date. The original Pump launch is a separate founder-controlled economic action within the SOC lifecycle; it cannot substitute for these product or security milestones. Each phase should be narrowed or changed if participant evidence shows that its proposed mechanism is not useful.

### Founding community roles and outcomes

Creators bring original work, test the tools and make their terms understandable. Buyers and collectors test whether those terms can be understood without private explanations, flag omissions and help choose useful community activity. Builders implement the disclosure, ownership and funding tools. Reviewers challenge records and controls. The founder operates the experiment and remains accountable for its availability, costs and releases.

The community should be able to track completed creator journeys and returning participants, the proportion of admitted launches with complete disclosures, known developer concentration, the proportion of unlock claims that are actually enforced, and funded creative work delivered. Reports must separate human participation from automated tests and distinguish a verified chain fact from a self-reported claim. These are measures to build and publish, not results already achieved.

The ambition is a cultural home people choose because creation is approachable, ownership is visible and commitments can be checked. The invitation is to help build and test that home, with a shared expectation that the work continues after the launch.

## 3 What Classic means

Bitcoin Cash and Ethereum Classic show that people can organize around a different view of what a blockchain should prioritize. Bitcoin Cash's history describes a split on 1 August 2017 after a disagreement over scaling, with an emphasis on everyday electronic cash. [Bitcoin Cash history](https://bitcoincash.org/) [4]

Ethereum's DAO fork occurred on 20 July 2016 at block 1,920,000. Some participants rejected that intervention and continued the chain that became Ethereum Classic. Ethereum's historical account and the Ethereum Classic community's account describe that divergence from their respective perspectives. [Ethereum fork history](https://ethereum.org/ethereum-forks/#dao-fork) [5], [Ethereum Classic genesis account](https://ethereumclassic.org/why-classic/genesis/) [6]

The useful analogy is the ability to gather a community around a durable priority. The technical histories are different. Bitcoin Cash and Ethereum Classic arose through divergence from existing ledgers. Solana Classic's experiment begins with a fresh genesis and no copied Solana ledger. The word "Classic" expresses a cultural aspiration; it does not establish continuity with an earlier Solana chain.

| Project | Defining disagreement or purpose | Relationship to an earlier ledger |
| --- | --- | --- |
| Bitcoin Cash | Scaling priorities and electronic cash | A historical Bitcoin chain split |
| Ethereum Classic | Continuation without the DAO state intervention | A historical Ethereum chain split |
| Solana Classic | A proposed ecosystem centred on memes and NFTs | A fresh independent experimental ledger |

Solana Classic is an independent project. Its name and use of open-source technology do not imply endorsement, partnership or affiliation with the Solana Foundation, Solana Labs or Anza. It does not call itself the original Solana, allocate assets to SOL holders, or promise that existing Solana NFTs can be used on its network.

## 4 TEST and the intended SOC lifecycle

SOC is intended to begin as a Solana token launched through Pump.fun and later be usable as the native currency of Solana Classic through a one-to-one redemption bridge. The original Solana token is the proposed bridge's canonical backing asset. Native Classic SOC is a distinct ledger representation backed under the proposed model. The current six-day implementation uses valueless TEST as its native development denomination. A working preview or test asset is not a launched SOC economic network.

| Scope | Current state | Meaning |
| --- | --- | --- |
| Experimental devnet | Remote script journey passed; complete release gates pending | One operator; native denomination TEST; no monetary value |
| Playground meme assets and NFTs | Remote issuance and transfer proof passed; browser acceptance pending | Token-2022 demo assets on the experiment; no monetary value |
| Original SOC on Solana | Pump.fun launch intended; token not created | Canonical original token for the proposed redemption model |
| Solana Classic mainnet and native SOC | Planned and unimplemented; no mainnet genesis | Native currency released from a protected reserve against original SOC escrow |
| Redemption bridge | Planned and unimplemented; no deployed addresses | Intended 1 original SOC to 1 native SOC in display units, with separate fees |
| SOC markets | Initial Pump market intended; no SOC market launched | Bonding curve first; any PumpSwap graduation is conditional; further pools unresolved |

The TEST experiment grants no conversion right, airdrop entitlement or allocation in mainnet SOC. Its founding testnet art is participation in a technical and cultural pilot. Test units are not sold, redeemable or represented as an investment. The validator's bootstrap balances are development configuration, not a proposed SOC supply. The planned mainnet bridge does not make TEST redeemable.

The original SOC token requires actual venue creation and mint verification. Native SOC requires a mainnet genesis, protected reserve and monetary policy consistent with one-to-one redemption. No total supply, developer allocation, reserve quantity or production fee schedule is invented here. Original mint state and native balances are verified from their respective chains. The proposed model excludes independent native inflation; adding issuance would require an explicitly revised backing model before adoption. No original mint, mainnet genesis, bridge escrow, reserve or pool address is published at this checkpoint.

## 5 The experimental network

### Runtime selection and independent identity

The initial runtime selection was upstream **Agave v4.3.0**, which Anza labels stable. Its official binaries were verified, but its Railway startup failed on unavailable mandatory `io_uring` support. There is no active, accepted v4.3.0 validator. An upstream release label does not establish compatibility with this hosting environment or production readiness for this project. [Agave v4.3.0 release](https://github.com/anza-xyz/agave/releases/tag/v4.3.0) [7]

Official **Agave v3.0.14** is running as the compatibility candidate. Its account-storage directory-removal code can fall back to standard filesystem operations when `io_uring` is unsupported or remover initialization fails. The fresh deployed candidate has passed startup, block progression, identity, health and the remote SDK action journey. Persistence, recovery and the wider release gates still require proof. No custom runtime patch or relaxation of kernel protections is part of this approach. [Agave v3.0.14 account-storage source](https://raw.githubusercontent.com/anza-xyz/agave/v3.0.14/accounts-db/src/utils.rs) [16]

The earlier Agave candidate's bundled Token-2022 programme failed variable metadata reallocation. The official Token-2022 v10.0.0 release fixes compatibility with `stricter_abi_and_runtime_constraints`. Its verified official artifact was loaded under the existing standard Token-2022 programme identity on the fresh candidate. This is an upstream programme update, not a bespoke token contract or a new asset standard. [Official Token-2022 v10.0.0 release](https://github.com/solana-program/token-2022/releases/tag/program@v10.0.0) [18]

| Early remote fact | Recorded value |
| --- | --- |
| API origin | [network-release-production.up.railway.app](https://network-release-production.up.railway.app) |
| Remote genesis | `7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon` |
| Official runtime commit | `f516a8927c76c07f0ebc54ca7a4ce8b2046eee86` |
| Official archive SHA256 | `65614325423316a48f57f1ceeaa91ca78f4516e165e305b38c01873cf8c6b8b4` |
| Token-2022 v10.0.0 commit | `3350a3ba856f5997c4ade91fd1e5c8b515e5df33` |
| Token-2022 artifact SHA256 | `a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68` |
| Proof scope | Identity, health, block progression, programme bytes and seven remote SDK actions; full acceptance pending |

The planned service uses `solana-test-validator` with persistent storage. Anza describes this tool as a full-featured single-node development cluster. The experiment will use a newly generated ledger and will not clone Solana accounts or programs from a public cluster. Required built-in and token programs must be checked on the actual deployed runtime before asset issuance is accepted. [Anza test validator documentation](https://docs.anza.xyz/cli/examples/test-validator) [8]

The genesis hash is the project's network identity. Local development and the remote public experiment must have separate records. The canonical remote hash is recorded only after the remote node exists, is compared against known public Solana networks and has passed the required proofs. A local hash cannot stand in for it.

The browser and gateway must both check the expected genesis before mutations. An unset or mismatching identity disables those actions. This reduces the risk of submitting test transactions to the wrong endpoint. It is a routing and verification control, not a cryptographic guarantee against a compromised frontend or operator-controlled RPC. Release evidence must therefore also bind the frontend deployment, API configuration and validator software to their recorded versions.

### Selected deployment architecture

| Component | Selected responsibility |
| --- | --- |
| Vercel static frontend | React and TypeScript interface; browser transaction construction and signing |
| Linux API | Fastify gateway; admission controls; immutable asset generation; faucet and gallery |
| SQLite | Durable faucet reservations, quotas, asset documents and gallery discovery records |
| Linux storage | Persistent validator ledger, database, artwork and immutable metadata |
| Agave validator | Actual SVM execution, account state and transaction receipts |
| Caddy and systemd | HTTPS gateway, restricted service exposure and supervised processes |

The browser calls a fixed API origin. The API forwards allowed RPC methods to a fixed private validator upstream. Direct public access to the validator RPC, WebSocket and native faucet ports must be blocked and externally checked. The API itself binds locally behind Caddy. Vercel does not host the validator or persistent chain storage. The Linux service still needs accepted machine capacity, persistent storage and operator access; those requirements are not satisfied by the live frontend preview.

The permanent API and metadata hostname must be established before remote immutable minting. Preview deployment URLs and localhost are unsuitable for those remote asset URIs. The production frontend may use the newly created Vercel project's stable production hostname. Frontend availability, API availability and ledger continuity are separate conditions and must be reported separately.

### The test wallet

The app creates an Ed25519 keypair in browser memory. It provides no import, export, persistent browser storage or third-party wallet connection. Refreshing or closing the page loses access to that keypair and its test assets. This consequence must appear before wallet creation. A second tab can create a recipient for transfer testing.

Memory-only storage limits persistence of the secret; it does not protect against malicious frontend code, cross-site scripting, compromised dependencies, browser extensions or an already compromised device. No founder mainnet key belongs in the app, API, build environment, log or repository. Any future mainnet, bridge or pool interface needs a separately reviewed wallet and signing design. The disposable test-wallet flow is unsuitable for real funds.

## 6 Asset creation and verification

### The supported asset model

The playground uses Token-2022 for both asset types and adds no new on-chain program. Metadata is stored on the mint using the metadata pointer and token metadata extensions. Solana's documentation explains these extensions and the separate authority required to update metadata. [Token-2022 metadata documentation](https://solana.com/docs/tokens/extensions/metadata) [9]

The selected demo meme asset has six decimals and a fixed initial supply of 1,000,000 display units. The demo NFT has zero decimals and supply exactly one. These values describe playground fixtures only. They do not describe mainnet native SOC or its supply.

The four presets are **Circle Face, Stepped Geometry, Grid Face and Orbit**. They are original, deterministic geometric SVG designs. Presets may recur across mints; a unique mint address does not make its image visually unique. Holding a token does not establish copyright ownership or confer rights beyond the disclosed test asset. The project promises support in its own app, not compatibility with outside marketplaces, wallet collections or indexers.

### Issuance and immutable authorities

The verified two-phase issuance model separates mint setup from completed issuance. Transaction A allocates the mint's fixed extension space, funds rent for its complete metadata and initializes the metadata pointer, mint and inline token metadata. The pointer has no authority, the freeze authority is absent, and the test wallet temporarily holds the authorities needed to complete issuance.

Transaction B creates the recipient token account if needed, mints the fixed amount, revokes mint authority and clears the temporary metadata update authority. Supply issuance and these authority changes are atomic. Both meme and NFT paths passed the remote script journey on the compatible official programme. The Token Program's authority instruction and the token-metadata interface's update-authority instruction are distinct operations; clearing one does not prove that the other was cleared. [Token authority documentation](https://solana.com/docs/tokens/basics/set-authority) [10], [Token metadata documentation](https://solana.com/docs/tokens/extensions/metadata) [9]

A successful setup is an incomplete asset. If finalization fails, the interface must offer a resume action on the same in-memory mint. It must not quietly create another mint. The app serializes and simulates each transaction, checks its size and records submission, confirmation and finalization as separate states. A signature returned by RPC is not evidence of successful issuance.

The gallery accepts an asset only after finalized chain verification establishes the expected Token-2022 program, mint and issuance transaction, fixed supply, decimals, metadata URI, and absent mint, freeze, pointer and metadata update authorities. Its database is a discovery registry, not ownership truth. Current NFT ownership is derived from the actual token account; the mint's program owner is not the holder. If an NFT is burned, the interface shows no current holder. If the chain cannot be read, ownership is unavailable rather than asserted from a stale registry row.

### Immutable files and their limits

The API generates image and metadata files from validated text and a fixed preset. It does not accept uploaded SVG, arbitrary image URLs or caller-provided remote metadata. Files use content-hashed paths and a stable metadata origin. Repeated identical inputs are handled idempotently.

Revoking update authority and using content-hashed files makes the selected asset state verifiable under the recorded chain and software. It does not force the operator to keep a server online, prevent deletion of a file, or make the whole network immutable against an operator who replaces the ledger or software. Metadata integrity, file availability and the experiment's operational continuity must be assessed separately.

## 7 Admission controls and operational ownership

### Selected public limits

| Service | Initial limits to implement and test |
| --- | --- |
| Faucet | 1 TEST per grant; 3 grants per wallet per day; 10 per IP per day; 1,000 TEST globally per day |
| RPC | 32 KB request; 2 MB response; 10 second timeout; 32 concurrent upstream requests; 100 admitted requests per second globally |
| RPC per IP | 1,200 reads per minute; 60 submissions per minute |
| Generated assets | 4 KB request; 24 KB combined files per asset; 150 new assets per IP per hour; 1,000 globally per day |
| Asset storage | 512 MB total generated-asset quota |
| Gallery | At most 50 records per paginated response; bounded on-chain lookups |

These are admission settings, not measured capacity or performance promises. Persistent accounting must survive API restarts. A faucet request reserves a grant atomically using a request identifier. An uncertain timeout is reconciled against its chain signature before another payment is attempted. Browser preflight requests must never reserve funds. Public RPC rejects arbitrary upstream destinations, batches, unknown methods and direct `requestAirdrop` calls.

The service permits the exact production frontend origin and explicitly listed previews. CORS is a browser access control, not authentication: clients outside a browser can omit the Origin header. Validation, quotas and rate limits therefore apply independently. IP limits can affect users behind a shared connection and can be evaded by distributed clients. The operator must publish degraded state and reduce admission when the actual host cannot safely meet the pilot workload.

### Founder responsibility and concentrated control

The founder is the intended operator. One validator and one Linux host concentrate execution, storage and availability in that operator. The founder can stop the service, control gateway access, change software and deliberately reset the experimental ledger. Persistent storage and backups reduce accidental loss; they do not create independent consensus security.

The normal service command must not reset the ledger. Restarts must preserve the genesis, balances and issued assets. Any deliberate reset requires disclosure and a new network identity record. Nothing in this experiment guarantees perpetual availability or preservation of valueless assets.

Before public release, the operator must have a working monitoring and recovery procedure. The selected monitoring cadence is 30 seconds, with alerts for repeated RPC failure, no slot progress for 60 seconds, disk use above 80 percent and memory use above 85 percent. Identity failure stops the faucet and new mint admission. The founder must choose an authorized alert destination and response arrangement; an agent chat is not continuous hosting or operations.

The first recovery drill is due by H36. It must stop services, create a consistent backup, restore into an isolated directory and verify the same genesis, balances and known assets. The backup covers the ledger, SQLite, immutable artwork and configuration, with protected operator files handled without disclosure. The procedure is reconfirmed on the candidate before freeze. Frontend rollback is tested separately from restoring Linux state.

The principal security limits are concentrated operator control, wrong-network configuration, frontend compromise, dependency defects, faulty issuance finalization, inconsistent backup, metadata unavailability and service abuse. Passing the specified controls can make the pilot reviewable and recoverable. It cannot justify handling production economic value or claiming Solana-scale security.

## 8 SOC launch and redeemable native currency

### The original SOC token on Solana

The founder intends the original **SOC** token to launch through Pump.fun on Solana. It is the proposed canonical backing asset for future native Classic SOC. The initial market is on Solana. Its actual mint, supply, decimals, authorities, venue state and creator-fee arrangements must be checked after authorized creation rather than predicted from a project name or an old venue example.

Pump's current documentation describes creation of a bonding-curve market, with initial parameters drawn from the programme's global state. Buying is a separate operation. A completed curve can migrate to PumpSwap, where the resulting LP tokens are burned. These are venue mechanics; they do not promise that SOC will complete its curve or acquire sustained liquidity. [Pump programme documentation](https://raw.githubusercontent.com/pump-fun/pump-public-docs/main/docs/PUMP_PROGRAM_README.md) [14]

Current `create_v2` documentation initializes a Token-2022 mint with six decimals and distinguishes creation from the buy instruction used by combined create-and-buy flows. Regular creation modes and fee settings must be verified immediately before launch. [Pump creation instructions](https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md) [13]

The founder intends developers to retain some SOC, but the amount, acquisition method and funding are unresolved. Standard creation must not be assumed to grant developers an arbitrary free allocation. Any purchased or otherwise acquired developer balance, its source, custody, restrictions and public addresses require explicit disclosure. The mint's actual supply and distribution must be recorded after launch. No founder purchase or market transaction follows automatically from the hosting budget or this whitepaper.

Any creator-fee recipient and use policy must be disclosed before release. Fees are subject to the current venue rules, and fee income cannot be the sole validator operating budget. No percentage or revenue is assumed here. [Pump fees](https://pump.fun/docs/fees) [15]

### Native Classic SOC

The intended mainnet currency is also **SOC**, native to Solana Classic. It would denominate native balances and transaction costs there. Native balances occupy the account model's lamport field; they are distinct from a Token-2022 mint. Moving or locking a Solana token does not itself turn that token into a native account balance on an independent chain. The destination needs its own genesis, native reserve and verified bridge logic. [Solana account documentation](https://solana.com/docs/core/accounts) [11]

The selected economic direction is **1 original Solana SOC redeemable for 1 native Classic SOC in display units**, and the reverse. Native SOC is intended as a bridge-backed representation of the original asset rather than an independent inflationary supply. The proposed implementation uses a protected native reserve allocated at mainnet genesis. Its quantity, custody, upgrade powers and release rules are not yet specified. Reserve units must not be freely spendable by developers or validators while simultaneously presented as collateral-controlled capacity.

The pilot's TEST balances do not become mainnet SOC. The experimental single-operator service does not establish an independent production validator set, an economic security model or support for real-money custody. SOC does not confer an ownership interest, guaranteed income, return or governance right through this whitepaper.

### Proposed escrow and reserve bridge

A bridge connects separate networks through an explicit verification mechanism. General bridge approaches differ in their custody and trust assumptions; sharing the SVM does not supply cross-chain verification. [Ethereum.org bridge documentation](https://ethereum.org/developers/docs/bridges/) [12]

The **candidate mechanism** is to escrow original Pump-launched SOC on Solana and, after verifying a final deposit, release an equal display-unit quantity of native SOC from the protected reserve on Solana Classic. The reverse path first returns native SOC to that reserve; only after verifying that finalized return can the bridge unlock the corresponding original SOC on Solana. This describes intended backing and redemption. No escrow, reserve, verifier, relayer or redemption service is deployed.

The bridge releases existing native reserve balances. It does not assume that an ordinary SPL mint instruction can create native currency. A native burn-and-reissue design would require different monetary and authority rules and is not the selected model. Native issuance, bridge settlement and developer holdings cannot be conflated.

Every deposit and return needs an identity bound to its source chain, asset, recipient, amount and message identifier. Finality verification and persistent replay protection must prevent one event from triggering two releases or unlocks. Incomplete transfers remain pending and recoverable through an explicit procedure; a timeout must not trigger a second payout. The verifier model, keys, threshold, upgrades and emergency powers remain to be selected and disclosed.

### Supply conservation and fees

Let **S** be the original token supply, **E** the original SOC held in verified bridge escrow and **N** the native SOC outside the protected reserve, all expressed in the same display units. The design must maintain **N <= E** and prevent release beyond the protected native reserve. Original SOC outside escrow plus native claims must satisfy **S - E + N <= S**. Escrowed originals and the unreleased protected native reserve are not counted again as independently circulating SOC.

Every native SOC balance outside the protected reserve counts toward N, including any genesis bootstrap balance and amounts held by developers, validators or programmes. Such balances require corresponding original SOC in verified escrow before they become spendable. Mainnet bootstrap funding must satisfy this same backing requirement; a fixed but unbacked initial allocation would violate the selected model.

These conditions require coherent finalized accounting of deposits, native releases, native returns and original unlocks, including pending messages. They are design requirements, not measured facts about a live bridge. The eventual specification must explain how reserve balances, developer holdings, fees and any burned units affect those records.

One-to-one applies to display units, not identical raw integer balances. If the original mint and native ledger use different decimal scales, the bridge must convert exactly between their base units, reject amounts that cannot be represented and test boundary values. The actual original decimals are read from the mint; the native unit scale is approved in the mainnet specification. Rounding must not create an extra claim or silently consume a redeemable amount.

Fees are charged and quoted separately from the nominal one-to-one exchange. A round trip deducts the spent network and bridge fees from the user's balances; one-to-one does not make transfers free. Native transaction fees transferred to validators remain outstanding native claims; fee burning reduces outstanding native units and needs an explicit collateral-accounting policy. Neither action authorizes extra original-token withdrawal. **Independent native inflation is excluded from this model.** Introducing it would require a revised, explicit backing model and new review before adoption.

One-to-one redemption is not a price peg guarantee or instant access to a market. It depends on available reserve capacity, escrow integrity, both networks, bridge controls and successful transaction settlement. The bridge is unavailable until implemented, reviewed and released. TEST, demo memes and founding testnet NFTs receive no bridge or conversion entitlement.

### Markets and later pools

The intended initial venue is Pump.fun on Solana, beginning with its bonding curve. A PumpSwap pool requires the venue's completion and migration conditions; it is not promised at token creation. Future Solana Classic pools or additional Solana venues remain unresolved. A native-chain pool would need a supported trading programme and a defined counterpart asset. An existing Solana venue must not be assumed to operate on the independent chain.

Any additional pool needs a chosen venue and pair, authorized funding, verified asset identities, review of its trading programme, and a published liquidity-ownership and fee policy. No deposit amount, initial ratio, lock arrangement or pool address is adopted. A bridge and a market are separate systems. Neither a deployment nor a deposit establishes buyers, market depth, execution price, returns or permanent liquidity.

### Gates before real funds

Bridge failures can expose collateral or prevent redemption. Risks include programme defects, verifier collusion, key compromise and failures during reorganizations or outages. First-party bridge guidance describes these categories; it does not establish that this future design has solved them. [Ethereum.org bridge documentation](https://ethereum.org/developers/docs/bridges/) [12]

The original token launch and later native mainnet need separate release evidence:

| Area | Required evidence and decisions |
| --- | --- |
| Original SOC launch | Founder release decision; current Pump settings; actual mint facts; disclosed developer acquisition and holdings; authorized spending and fee policy |
| Native monetary design | Protected genesis reserve; no independent inflation; approved decimal mapping, fee accounting and validator incentives; verified native configuration |
| Chain security and operation | Independent validator plan; consensus and recovery testing; secure operator keys; funded monitoring and incident response |
| Bridge specification | Defined trust model; escrow/reserve conservation; finality policy; replay protection; pending-transfer and recovery rules |
| Bridge review and testing | Independent security review; two-way test journeys; forged/replayed-message rejection; decimal boundaries; outage, reorganization and recovery tests |
| Controls and disclosure | Public upgrade, pause and withdrawal powers; bounded initial exposure; response owners; verifiable escrow and reserve accounting |
| Further pool readiness | Selected network, venue and pair; reviewed trading programme; authorized liquidity funding; ownership and fee policy; verified addresses |

These are entry conditions for their respective releases. A passing TEST soak does not pass native-mainnet or bridge security gates. Publishing this whitepaper does not authorize token purchases, mainnet launch, bridge deployment or liquidity deposits.

## 9 Evidence and falsifiable milestones

### The fixed six day clock

The programme started at T0 on 13 October 2026 at 03:00:54 UTC. Delayed access does not restart the clock. H108 is the first-release target, conditional on passing evidence. H144 is the final delivery deadline, not a reason to mark a failed gate successful.

| Milestone | UTC | Europe London | Required outcome |
| --- | --- | --- | --- |
| H24 thin journey | 14 Oct 03:00:54 | 14 Oct 04:00:54 | Production frontend through API to remote chain, with persistence proof |
| H36 recovery | 14 Oct 15:00:54 | 14 Oct 16:00:54 | First isolated backup and restore proof |
| H48 to H60 pilot | 15 Oct 03:00:54 to 15:00:54 | 15 Oct 04:00:54 to 16:00:54 | Two external users; failures repaired and rerun |
| H72 freeze | 16 Oct 03:00:54 | 16 Oct 04:00:54 | Candidate frozen; first full soak begins |
| H108 first release target | 17 Oct 15:00:54 | 17 Oct 16:00:54 | Release if first soak and final gates pass; otherwise repaired candidate frozen |
| H132 replacement soak | 18 Oct 15:00:54 | 18 Oct 16:00:54 | Reserved replacement 24 hour soak completed |
| H144 deadline | 19 Oct 03:00:54 | 19 Oct 04:00:54 | Deliver passed scope and exact remaining failures |

### Acceptance gates

| Gate | Evidence required before it passes |
| --- | --- |
| G0 | Recorded executable and dependency manifest; working selected remote infrastructure and origins |
| G1 | Independent remote genesis; native transfer; token and NFT proofs with reachable metadata |
| G2 | Actual production browser journey through the Linux API; durable faucet, receipts, restart and deep-link refresh |
| G3 | Complete usable journey, verified discovery and first successful recovery drill |
| G4 | Two external testers complete clean-browser journeys; failed journeys repaired and rerun |
| G5 | Negative, bounded-load and recovery controls pass; operator review and candidate freeze |
| G6 | Uninterrupted 24 hour soak of the final core candidate |
| G7 | Final regression, release evidence, reachable anonymous HTTPS and operator handover |

The external pilot is performed by humans outside the implementation team without terminal access or developer intervention. Agent QA can find defects and exercise journeys; it does not satisfy that user gate. Both testers must exercise the wallet, faucet, issuance, gallery, receipts and transfer path. Difficulties are recorded with the step, browser, outcome and repair evidence.

The soak covers the validator, gateway, faucet, signing and issuance logic, storage and recovery configuration. A core change restarts the full 24 hour requirement. Static copy or artwork selection changes use targeted checks; changes to transaction logic, metadata origin or executable asset content do not receive that exception. A replacement soak is reserved so a serious defect can be repaired without deleting the stability requirement.

If controls fail, the permitted outcome is an invite-only alpha or a reproducible local package with deployment instructions. The evidence must say which. No remote host means no public network claim. A deadline with a failed gate means an incomplete release, even if the interface looks finished.

### Measurement method

Every technical report must identify its scope as local or remote, UTC test window, genesis, source commit, runtime versions and hashes, frontend deployment, API origin and candidate configuration. It records transaction signatures, slots, actual results, error classifications, workload and resource conditions. Explorer links are supporting views; the chain response and retained evidence establish the reported result.

| Question | Measurement and interpretation |
| --- | --- |
| Does the journey work | Attempts and finalized successes for each action; end-to-end completion rate; no success from submission alone |
| Is the service stable | Slot progress and health samples; outages and duration; CPU, memory and disk during a stated workload |
| How fast is the pilot | Submission-to-confirmation and submission-to-finalization times, sample count, median and p95 where sample size supports them |
| Is state recoverable | Before/after genesis, balances, supply, authorities and ownership for named test assets after restart and restore |
| Does focus matter to people | External task completion and feedback; later opt-in return visits and repeat creation, reported separately from agent traffic |

Latency comparisons must include hardware, concurrency, action type, network path, admission settings and failures. Admission caps are not throughput measurements. A small sample cannot establish tail behavior or broad capacity. No benchmark result is published before measurement, and upstream performance claims are not transferred to this one-host experiment.

Cultural evaluation also has limits. A wallet address is not a person; refreshing this app changes its disposable wallet. Faucet requests and mints can be automated. Human pilot results, technical QA and organic participation therefore stay separate. Any later retention study must use a disclosed, consent-based method that respects the wallet's memory-only design. The sprint does not invent analytics results or a minimum community size.

## 10 Conditions for a later mainnet programme

After a passed release, the proposed first step is to operate the pilot, interview participants and learn whether creators return. A later multi-validator experiment and supported-wallet evaluation would need named operators, funding and a separate test plan. Weeks 3 to 4 and weeks 5 to 8 are planning windows for those decisions, not promised launch dates.

The intended production direction is an independent Solana Classic mainnet with native SOC redeemable one-to-one for the original Pump-launched SOC through a reviewed bridge. It needs evidence that a separate chain serves creators better than an application on an existing network. It also needs independent validators, economic security analysis, reserve and fee design, wallet and infrastructure readiness, security review, recovery plans and credible operating funding. Neither a market listing nor a successful single-validator soak supplies those conditions.

The redemption bridge and any later pools require their own specification, budget, security work and acceptance evidence. Their launch date is not set by the six-day experiment or the original token's creation. TEST and demo assets have no conversion entitlement to mainnet SOC. Any additional migration or asset support needs an explicit design before it is offered.

The thesis is weakened if people cannot complete the creation journey, do not return, find the focus unhelpful, or cannot identify a benefit from independent infrastructure. Those outcomes should change the roadmap. The project's reason to continue is demonstrated creator value and sustainable operation, not the obligation to fulfill a chain narrative.

## 11 Founder decisions and release disclosures

The immediate work is to complete browser journeys against the script-tested Railway candidate, verify persistence and recovery, pass bounded load and the candidate soak, establish active backup storage and an alert/response arrangement, and book two external testers. The passed seven-action remote proof is recorded alongside the retained earlier probes. The frontend preview is live on Vercel, but full network, browser and operating acceptance is still pending.

For the initial Pump launch, the founder must resolve final metadata, the release decision, current venue settings, authorized spending, developer-retained quantity and how it is obtained, custody and public-address disclosures, and creator-fee policy. The original token's actual supply and authorities are recorded after creation. No free developer allocation is assumed.

For mainnet native SOC, the founder must approve the reserve quantity and protections, decimal mapping, native fee and burn treatment, validator incentives, governance, upgrade powers and operating funding within the selected one-to-one model. Independent native inflation is excluded unless a revised model is explicitly adopted. These decisions must be checked against the deployed genesis and ledger.

For the bridge and later pools, the founder must choose the verifier/trust model, security-review scope, escrow and reserve control, recovery and emergency powers, and any additional venue, pair, liquidity funding and LP-ownership arrangements. Those decisions remain unresolved. No deployed address or security guarantee is invented here.

Every public release must disclose its actual genesis, software and hashes, operator count, reset policy, supported actions, measured limitations, deployment and evidence references, known defects and operator contact. Original SOC, native mainnet, redemption bridge and market states are reported independently within the same lifecycle. Readers should be able to distinguish the live frontend preview, an accepted TEST devnet, a created original SOC token, a launched native mainnet, an operating redemption bridge and any actual pool.

## References

Primary and first-party sources consulted on 13 October 2026. The Bitcoin Cash and Ethereum Classic materials express their communities' perspectives. They support the historical comparison, not a claim of technical equivalence or endorsement. The July 2025 post records Yakovenko's view and the public exchange, not a poll of Solana leadership or participants.

1. Solana Foundation. **Monthly community update December 2021**. Published 12 January 2022. https://solana.com/news/december-2021-community-update
2. Solana. **Internet capital markets**. https://solana.com/solutions/tokenization
3. Solana. **AI on Solana**. https://solana.com/solutions/ai
4. Bitcoin Cash community. **The History of Bitcoin Cash**. https://bitcoincash.org/
5. Ethereum.org. **Timeline of all Ethereum forks**, DAO fork entry. https://ethereum.org/ethereum-forks/#dao-fork
6. Ethereum Classic community. **Genesis**. Published 22 February 2022; page labels its account opinionated. https://ethereumclassic.org/why-classic/genesis/
7. Anza. **Agave release v4.3.0**. https://github.com/anza-xyz/agave/releases/tag/v4.3.0
8. Anza. **Solana Test Validator**. https://docs.anza.xyz/cli/examples/test-validator
9. Solana documentation. **Metadata Pointer and Token Metadata**. https://solana.com/docs/tokens/extensions/metadata
10. Solana documentation. **Set Authority**. https://solana.com/docs/tokens/basics/set-authority
11. Solana documentation. **Accounts**. https://solana.com/docs/core/accounts
12. Ethereum.org. **Bridges**. https://ethereum.org/developers/docs/bridges/
13. Pump. **Coin Creation Instructions**. https://github.com/pump-fun/pump-public-docs/blob/main/docs/instructions/COIN_CREATION.md
14. Pump. **Pump Programme**. https://raw.githubusercontent.com/pump-fun/pump-public-docs/main/docs/PUMP_PROGRAM_README.md
15. Pump. **Pump.fun fees**. https://pump.fun/docs/fees
16. Anza. **Agave v3.0.14 account-storage source**, directory-operation fallback. https://raw.githubusercontent.com/anza-xyz/agave/v3.0.14/accounts-db/src/utils.rs
17. Anatoly Yakovenko (toly). **Post on meme coins and NFTs**. Published 27 July 2025. https://x.com/toly/status/1949548737208181137
18. Solana Program maintainers. **Token-2022 programme v10.0.0 release**. https://github.com/solana-program/token-2022/releases/tag/program@v10.0.0

### Project sources

The experimental design and implementation records are maintained in `CONTRIBUTING.md`, `docs/planning/ACCEPTANCE_CHECKLIST.md`, `docs/CONTRACTS.md`, `docs/sprint-clock.json`, `docs/STATUS.md`, `docs/access-status.json`, `config/network.json`, `config/network.remote.json`, `config/launch.json`, `evidence/remote-bootstrap.json`, `evidence/chain-smoke-remote.json` and `packages/config/src/index.ts`. The Pump-first origin and intended one-to-one native redemption follow the founder's current decision. This whitepaper does not replace acceptance records. A live-network release requires the completed evidence packet and a new dated checkpoint.
