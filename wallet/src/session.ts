import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction } from '@solana/web3.js';
import { encodeBase58, waitForSignature } from '../../packages/chain/src/index';
import type { FaucetReceipt, GalleryEntry, NetworkFacts, NetworkStatus } from '../../packages/config/src/index';
import { API, GENESIS, parseAmount, validateTransfer, verifyIdentity } from './guards';
export type SendPlan = { recipient: string; amount: number; fee: number; sender: string };
export class TestSession {
  #key: Keypair | null = null;
  #faucetId: string | null = null;
  #pendingSend: string | null = null;
  #mutating = false;
  #consumedPlans = new WeakSet<SendPlan>();
  #issuedPlans = new WeakSet<SendPlan>();
  readonly connection = new Connection(API + '/api/rpc', { commitment: 'confirmed', disableRetryOnRateLimit: true });
  address() { return this.#key?.publicKey.toBase58() ?? ''; }
  create() { if (this.#mutating) throw new Error('Wait for the current action before changing the session.'); if (this.#key) throw new Error('Close the current session before creating another.'); this.#key = Keypair.generate(); return this.address(); }
  forget() { if (this.#mutating) throw new Error('Wait for the current action before closing the session.'); this.#key = null; this.#faucetId = null; this.#pendingSend = null; }
  async #api<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(API + path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15_000) });
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
    if (this.#pendingSend) throw new Error('A transfer is awaiting confirmation. Check its receipt before sending again.');
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
    await this.verify(); if (!this.#pendingSend) return null;
    await waitForSignature(this.connection, this.#pendingSend, 'confirmed');
    const signature = this.#pendingSend; this.#pendingSend = null; return signature;
  }
}
