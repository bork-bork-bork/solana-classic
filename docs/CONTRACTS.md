# API and action contracts

Frozen initial contracts: packages/config/src/index.ts. All browser APIs use the explicit VITE_API_BASE_URL; no same-origin fallback. Linux API is the sole upstream RPC gateway and asset registry. Browser signs its own disposable test transactions.

Network identity comes from config/network.remote.json (remote) or ignored .data/local/network.json (local). Browser build's VITE_EXPECTED_GENESIS_HASH must match the API facts and actual node. An unset identity disables mutations. Test helpers reject known public Solana networks.

GET /api/network returns NetworkFacts; GET /api/status returns NetworkStatus; POST /api/rpc accepts a single allowlisted JSON-RPC envelope; POST /api/faucet accepts {publicKey,requestId} and returns FaucetReceipt; POST /api/assets accepts AssetInput and returns AssetDocument; POST /api/gallery accepts {mint,issuanceSignature,contentHash}; GET /api/gallery returns {entries,nextCursor}; GET /api/gallery/:mint resolves actual current ownership; /assets/:hash/image.svg and metadata.json serve immutable content.

Errors: {error:{code,message}} with appropriate non-2xx status. RPC forwards valid JSON-RPC errors without representing them as transaction success. Confirmation and finalisation are separate. A submitted signature is never itself a success. Client action progress uses ActionProgress/ActionPhase; incomplete issuance resumes transaction B on the same in-memory mint, never an automatic duplicate mint.

Metadata generation, faucet accounting and gallery mutation enforce persistent limits. OPTIONS cannot reserve funds. Origin checks supplement validation/rate limits and are not authentication. Frontend previews have explicit separate environment and CORS entries.

Founder supplied no owned domain. A newly created Vercel project's default stable production hostname is acceptable for the frontend; the permanent Linux API/asset hostname still must be established before remote immutable minting.

Browser RPC preflight permits exactly Content-Type and solana-client (the pinned web3.js identification header), with existing exact origins and GET/POST/OPTIONS. The bounded readonly getVersion method reports runtime identity. Credentials remain disabled.
