import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js';
import { encodeBase58, waitForSignature, verifyAsset } from '../../packages/chain/src/index';
import { assetInputSchema, MEME_SUPPLY, type AssetDocument, type FaucetReceipt, type GalleryEntry, type NetworkFacts, type NetworkStatus } from '../../packages/config/src/index';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { API, GENESIS, parseAmount, validateTransfer, verifyIdentity } from './guards';
import { gatewayBase, immutableAsset, IMAGE_API, type GatewayOptions } from './gateway';
import { uploadBytes } from './upload';
import { ownedCandidates } from './inventory';
import { creationMessage } from './creation';
export type SendPlan = { recipient: string; amount: number; fee: number; sender: string };
export type CreationPlan = Readonly<{ document: Readonly<AssetDocument>; sender: string; fee: number; rent: number; units: string }>;
export type OwnedAsset = GalleryEntry & { units: string; decimals: number; tokenAccounts: string[] };
export type Inventory = { owner: string; verified: OwnedAsset[]; unverified: number; scannedAccounts: number; totalAccounts: number; truncated: boolean; slot: number };
export class TestSession {
  #key: Keypair | null = null;
  #faucetId: string | null = null;
  #pendingSend: string | null = null;
  #mutating = false;
  #consumedPlans = new WeakSet<SendPlan>();
  #issuedPlans = new WeakSet<SendPlan>();
  #creationSigners = new WeakMap<CreationPlan, Keypair>();
  #pendingCreation: { plan: CreationPlan; signature: string } | null = null;
  #consumedCreations = new WeakSet<CreationPlan>();
  readonly base: string;
  readonly connection: Connection;
  constructor(options: GatewayOptions = {}) { this.base = gatewayBase(options); this.connection = new Connection(this.base + '/api/rpc', { commitment: 'confirmed', disableRetryOnRateLimit: true }); }
  artwork(value: string) { try { if (!/\/image\.(svg|png)$/.test(new URL(value).pathname)) return null; return immutableAsset(value, this.base); } catch { return null; } }
  hasPendingCreation() { return this.#pendingCreation !== null; }
  address() { return this.#key?.publicKey.toBase58() ?? ''; }
  create() { if (this.#mutating) throw new Error('Wait for the current action before changing the session.'); if (this.#key) throw new Error('Close the current session before creating another.'); this.#key = Keypair.generate(); return this.address(); }
  forget() { if (this.#mutating) throw new Error('Wait for the current action before closing the session.'); this.#key = null; this.#faucetId = null; this.#pendingSend = null; this.#pendingCreation = null; this.#creationSigners = new WeakMap(); }
  async #api<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(this.base + path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? 'Network request failed.');
    return result as T;
  }
  async verify() {
    const [facts, status, actual] = await Promise.all([this.#api<NetworkFacts>('/api/network'), this.#api<NetworkStatus>('/api/status'), this.connection.getGenesisHash()]);
    verifyIdentity(facts, status, actual); return status;
  }
  async balance() { await this.verify(); if (!this.#key) return 0; return this.connection.getBalance(this.#key.publicKey, 'confirmed'); }
  async gallery() {
    await this.verify();
    const result = await this.#api<{ entries: GalleryEntry[]; nextCursor: string | null }>('/api/gallery?limit=12');
    return result.entries;
  }
  async inventory(): Promise<Inventory> {
    await this.verify(); if (!this.#key) throw new Error('Create a test session to view owned assets.');
    const owner = this.#key.publicKey;
    const response = await this.connection.getTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, 'finalized');
    const candidates = ownedCandidates(owner, response.value); const verified: OwnedAsset[] = []; let unverified = candidates.rejected;
    for (const candidate of candidates.candidates) {
      try {
        const entry = await this.#api<GalleryEntry>('/api/gallery/' + candidate.mint);
        if (entry.mint !== candidate.mint) throw new Error('Registered mint differs from owned token account.');
        immutableAsset(entry.uri, this.base); immutableAsset(entry.image, this.base);
        const { mint } = await verifyAsset(this.connection, entry);
        if (candidate.units > mint.supply || (entry.kind === 'nft' && candidate.units !== 1n)) throw new Error('Owned units do not match verified mint supply.');
        if (entry.kind === 'nft' && 'currentOwner' in entry && entry.currentOwner !== owner.toBase58()) throw new Error('NFT holder verification disagrees or is unavailable.');
        verified.push({ ...entry, units: candidate.units.toString(), decimals: mint.decimals, tokenAccounts: candidate.tokenAccounts });
      } catch { unverified++; }
    }
    await this.verify(); if (this.address() !== owner.toBase58()) throw new Error('Session changed during inventory verification.');
    return { owner: owner.toBase58(), verified, unverified, scannedAccounts: candidates.scannedAccounts, totalAccounts: candidates.totalAccounts, truncated: candidates.truncated, slot: response.context.slot };
  }
  async prepareCreation(input: { kind: 'nft' | 'meme'; name: string; symbol: string; presetId: number; imageData?: string }): Promise<CreationPlan> {
    if (this.#mutating) throw new Error('A wallet action is already running.'); this.#mutating = true;
    try {
      await this.verify(); if (!this.#key) throw new Error('Create a test session first.');
      if (this.#pendingSend || this.#pendingCreation) throw new Error('Reconcile the pending transaction before creating another asset.');
      const { imageData, ...fields } = input;
      const upload = imageData !== undefined;
      if (upload && !this.base.endsWith('/_network')) throw new Error('Uploaded artwork requires the official same-origin Classic adapter.');
      const payload = upload ? uploadBytes(imageData) : undefined;
      const signer = Keypair.generate(); const parsed = assetInputSchema.parse({ ...fields, mint: signer.publicKey.toBase58() });
      const document = await this.#api<AssetDocument>(upload ? '/api/upload-assets' : '/api/assets', upload ? { ...parsed, imageData: payload } : parsed);
      for (const key of ['mint', 'kind', 'name', 'symbol', 'presetId'] as const) if (document[key] !== parsed[key]) throw new Error('Immutable asset differs from the reviewed creation input.');
      const assetOrigin = upload ? IMAGE_API : API;
      if (!/^[a-f0-9]{64}$/.test(document.contentHash) || document.uri !== assetOrigin + '/assets/' + document.contentHash + '/metadata.json' || document.image !== assetOrigin + '/assets/' + document.contentHash + '/image.' + (upload ? 'png' : 'svg')) throw new Error('Immutable metadata identity is invalid.');
      const [metadataResponse, imageResponse] = await Promise.all([fetch(immutableAsset(document.uri, this.base), { signal: AbortSignal.timeout(15_000), credentials: 'omit' }), fetch(immutableAsset(document.image, this.base), { signal: AbortSignal.timeout(15_000), credentials: 'omit' })]);
      if (!metadataResponse.ok || !imageResponse.ok) throw new Error('Immutable metadata/artwork is unavailable.');
      const metadata = await metadataResponse.json();
      if (metadata.name !== document.name || metadata.symbol !== document.symbol || metadata.image !== document.image) throw new Error('Stored metadata differs from the creation.');
      const built = await creationMessage(this.connection, this.#key, signer, document);
      const [fee, balance] = await Promise.all([this.connection.getFeeForMessage(built.message, 'confirmed'), this.connection.getBalance(this.#key.publicKey, 'confirmed')]);
      validateTransfer(this.address(), document.mint, built.rent, balance, fee.value);
      const plan = Object.freeze({ document: Object.freeze({ ...document }), sender: this.address(), fee: fee.value!, rent: built.rent, units: (document.kind === 'nft' ? 1n : MEME_SUPPLY).toString() });
      this.#creationSigners.set(plan, signer); return plan;
    } finally { this.#mutating = false; }
  }
  async createAsset(plan: CreationPlan, receipt: (signature: string) => void) {
    if (this.#mutating) throw new Error('A wallet action is already running.'); this.#mutating = true;
    try {
      await this.verify(); if (!this.#key || plan.sender !== this.address()) throw new Error('The reviewed session has changed.');
      const signer = this.#creationSigners.get(plan);
      if (!signer) throw new Error('Prepare an asset review in this wallet before signing.');
      if (this.#consumedCreations.has(plan) || this.#pendingCreation || this.#pendingSend) throw new Error('This creation is already submitted or another transaction is pending. Resume the same receipt.');
      const built = await creationMessage(this.connection, this.#key, signer, plan.document);
      if (built.rent > plan.rent) throw new Error('Rent changed. Prepare a new creation review.');
      const checkBudget = async () => {
        const [fee, balance, mintRent, accountRent] = await Promise.all([this.connection.getFeeForMessage(built.message, 'confirmed'), this.connection.getBalance(this.#key!.publicKey, 'confirmed'), this.connection.getMinimumBalanceForRentExemption(built.mintSpace), this.connection.getMinimumBalanceForRentExemption(built.accountSpace)]);
        validateTransfer(plan.sender, plan.document.mint, built.rent, balance, fee.value);
        if (fee.value! > plan.fee || mintRent > built.mintRent || accountRent > built.accountRent || mintRent + accountRent > plan.rent) throw new Error('Creation fee or rent changed. Review again before signing.');
      };
      await checkBudget(); await this.verify();
      const signed = new VersionedTransaction(built.message); signed.sign([this.#key, signer]);
      const bytes = signed.serialize(); if (bytes.byteLength > 1232) throw new Error('Creation exceeds the transaction size bound. Shorten the metadata.');
      const simulation = await this.connection.simulateTransaction(signed, { sigVerify: true, commitment: 'confirmed' });
      if (simulation.value.err) throw new Error('Simulation rejected the creation: ' + JSON.stringify(simulation.value.err));
      await checkBudget(); await this.verify();
      const anticipated = encodeBase58(signed.signatures[0]!);
      this.#consumedCreations.add(plan); this.#pendingCreation = { plan, signature: anticipated }; receipt(anticipated);
      const signature = await this.connection.sendRawTransaction(bytes, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 });
      if (signature !== anticipated) throw new Error('Creation returned a different receipt. Resume the recorded transaction.');
      return await this.#finalizeCreation();
    } finally { this.#mutating = false; }
  }
  async #finalizeCreation() {
    const pending = this.#pendingCreation; if (!pending) throw new Error('No creation is awaiting reconciliation.');
    await waitForSignature(this.connection, pending.signature, 'finalized'); await this.verify();
    await verifyAsset(this.connection, pending.plan.document);
    await this.#api(pending.plan.document.image.startsWith(IMAGE_API + '/') ? '/api/upload-gallery' : '/api/gallery', { mint: pending.plan.document.mint, contentHash: pending.plan.document.contentHash, issuanceSignature: pending.signature });
    this.#pendingCreation = null; this.#creationSigners.delete(pending.plan);
    return { document: pending.plan.document, signature: pending.signature };
  }
  async resumeCreation() {
    if (this.#mutating) throw new Error('A wallet action is already running.'); this.#mutating = true;
    try { await this.verify(); return await this.#finalizeCreation(); } finally { this.#mutating = false; }
  }
  async claim() {
    if (this.#mutating) throw new Error('A wallet action is already running.'); this.#mutating = true;
    try {
    await this.verify(); if (!this.#key) throw new Error('Create a test session first.');
    this.#faucetId ??= crypto.randomUUID();
    let receipt = await this.#api<FaucetReceipt>('/api/faucet', { publicKey: this.address(), requestId: this.#faucetId });
    if (receipt.signature) { await waitForSignature(this.connection, receipt.signature, 'confirmed'); await this.verify(); receipt = await this.#api<FaucetReceipt>('/api/faucet', { publicKey: this.address(), requestId: this.#faucetId }); }
    if (receipt.state !== 'confirmed' || !receipt.signature) throw new Error(receipt.message + ' Retry checks the same request; it does not request another grant.');
    this.#faucetId = null; return receipt.signature;
    } finally { this.#mutating = false; }
  }
  async plan(recipient: string, displayAmount: string): Promise<SendPlan> {
    await this.verify(); if (!this.#key) throw new Error('Create a test session first.');
    if (this.#pendingSend || this.#pendingCreation) throw new Error('A transaction is awaiting confirmation. Check its receipt before sending again.');
    const amount = parseAmount(displayAmount); const sender = this.address(); const destination = new PublicKey(recipient.trim());
    const [latest, balance] = await Promise.all([this.connection.getLatestBlockhash('confirmed'), this.connection.getBalance(this.#key.publicKey, 'confirmed')]);
    const message = new Transaction({ feePayer: this.#key.publicKey, ...latest }).add(SystemProgram.transfer({ fromPubkey: this.#key.publicKey, toPubkey: destination, lamports: amount })).compileMessage();
    const fee = (await this.connection.getFeeForMessage(message, 'confirmed')).value;
    validateTransfer(sender, destination.toBase58(), amount, balance, fee);
    const plan = Object.freeze({ recipient: destination.toBase58(), amount, fee: fee!, sender });
    this.#issuedPlans.add(plan); return plan;
  }
  async send(plan: SendPlan, receipt: (signature: string) => void) {
    if (this.#mutating) throw new Error('A wallet action is already running.'); this.#mutating = true;
    try {
    await this.verify(); if (!this.#key || plan.sender !== this.address()) throw new Error('The approved session has changed.');
    if (!this.#issuedPlans.has(plan)) throw new Error('Create a fresh transfer review in this wallet before signing.');
    if (this.#consumedPlans.has(plan)) throw new Error('This transfer review was already submitted. Review a new transfer.');
    if (this.#pendingSend) throw new Error('Check the pending transfer before sending again.');
    const units = BigInt(plan.amount);
    const refreshed = await this.plan(plan.recipient, `${units / 1_000_000_000n}.${(units % 1_000_000_000n).toString().padStart(9, '0')}`);
    if (refreshed.amount !== plan.amount || refreshed.fee > plan.fee) throw new Error('The fee changed. Review the transfer again.');
    // Approve and simulate this exact message. The shared helper obtains another
    // blockhash internally, so it cannot enforce this wallet's reviewed fee cap.
    const latest = await this.connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({ feePayer: this.#key.publicKey, ...latest }).add(SystemProgram.transfer({ fromPubkey: this.#key.publicKey, toPubkey: new PublicKey(plan.recipient), lamports: plan.amount }));
    const message = transaction.compileMessage();
    const checkFee = async () => {
      const [fee, balance] = await Promise.all([this.connection.getFeeForMessage(message, 'confirmed'), this.connection.getBalance(this.#key!.publicKey, 'confirmed')]);
      validateTransfer(plan.sender, plan.recipient, plan.amount, balance, fee.value);
      if (fee.value! > plan.fee) throw new Error('The fee changed. Review the transfer again.');
    };
    await checkFee(); await this.verify();
    const signed = new VersionedTransaction(message); signed.sign([this.#key]);
    const bytes = signed.serialize(); if (bytes.byteLength > 1232) throw new Error('Transfer exceeds the supported transaction size.');
    const simulation = await this.connection.simulateTransaction(signed, { sigVerify: true, commitment: 'confirmed' });
    if (simulation.value.err) throw new Error('Simulation rejected the transfer: ' + JSON.stringify(simulation.value.err));
    await checkFee(); await this.verify();
    const anticipated = encodeBase58(signed.signatures[0]!);
    // Retain the receipt before broadcast. A timeout must never cause a new send.
    this.#consumedPlans.add(plan); this.#pendingSend = anticipated; receipt(anticipated);
    const signature = await this.connection.sendRawTransaction(bytes, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 });
    if (signature !== anticipated) throw new Error('Network returned a different receipt. Check the signed transaction before retrying.');
    await waitForSignature(this.connection, signature, 'confirmed');
    this.#pendingSend = null; return signature;
    } finally { this.#mutating = false; }
  }
  async reconcileSend() {
    if (this.#mutating) throw new Error('A wallet action is already running.'); this.#mutating = true;
    try {
      await this.verify(); const signature = this.#pendingSend; if (!signature) return null;
      await waitForSignature(this.connection, signature, 'confirmed');
      this.#pendingSend = null; return signature;
    } finally { this.#mutating = false; }
  }
}
