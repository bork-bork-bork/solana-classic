import { useRef, useState } from 'react';
import type { Keypair, Connection } from '@solana/web3.js';
import type { Issuance } from '@solana-classic/chain';
import { assetInputSchema, type AssetDocument, type ActionProgress, type FaucetReceipt } from '@solana-classic/config';
import { API_BASE, EXPECTED_GENESIS, api, parseUnits, shortAddress } from './api';
import { PresetPicker, Notice, Address } from './components';

export default function Playground({ canMutate }: { canMutate: boolean }) {
  const wallet = useRef<Keypair | null>(null); const connection = useRef<Connection | null>(null);
  const issuance = useRef<Issuance | null>(null); const busyRef = useRef(false); const faucetRequest = useRef<string | null>(null);
  const [publicKey, setPublicKey] = useState(''); const [balance, setBalance] = useState<number | null>(null);
  const [kind, setKind] = useState<'nft' | 'meme'>('nft'); const [name, setName] = useState('Circle Theory'); const [symbol, setSymbol] = useState('CIRCLE'); const [presetId, setPreset] = useState(0);
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState<ActionProgress | null>(null); const [error, setError] = useState('');
  const [activity, setActivity] = useState<{ label: string; signature: string; mint?: string }[]>([]); const [recipient, setRecipient] = useState(''); const [amount, setAmount] = useState('0.01');
  const [completed, setCompleted] = useState<AssetDocument | null>(null);
  const record = (label: string, signature: string, mint?: string) => setActivity(previous => [{ label, signature, mint }, ...previous].slice(0, 12));
  const refreshBalance = async () => { if (connection.current && wallet.current && canMutate) setBalance(await connection.current.getBalance(wallet.current.publicKey, 'confirmed')); };
  async function run(operation: () => Promise<void>, requiresNetwork = true) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { if (requiresNetwork && !canMutate) throw new Error('The verified experimental network is not connected. Actions are paused.'); await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Action could not be completed.'); if (issuance.current && !completed) setProgress({ phase: 'incomplete', mint: issuance.current.document.mint, message: 'Issuance is incomplete. Resume uses the same mint and existing receipts.' }); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function createWallet() {
    await run(async () => { const sdk = await import('@solana/web3.js'); wallet.current = sdk.Keypair.generate(); setPublicKey(wallet.current.publicKey.toBase58()); if (API_BASE) connection.current = new sdk.Connection(API_BASE + '/api/rpc', { commitment: 'confirmed', disableRetryOnRateLimit: true }); await refreshBalance(); }, false);
  }
  async function claim() {
    await run(async () => {
      if (!wallet.current || !connection.current) throw new Error('Create your test wallet first.');
      faucetRequest.current ??= crypto.randomUUID();
      let receipt = await api<FaucetReceipt>('/api/faucet', { publicKey, requestId: faucetRequest.current });
      if (receipt.signature) { const chain = await import('@solana-classic/chain'); await chain.waitForSignature(connection.current, receipt.signature, 'confirmed'); receipt = await api<FaucetReceipt>('/api/faucet', { publicKey, requestId: faucetRequest.current }); }
      if (receipt.state !== 'confirmed' || !receipt.signature) throw new Error(receipt.message);
      record('1 TEST received', receipt.signature); faucetRequest.current = null; await refreshBalance();
    });
  }
  async function mint() {
    await run(async () => {
      if (!wallet.current || !connection.current) throw new Error('Create your test wallet first.');
      const chain = await import('@solana-classic/chain'); const sdk = await import('@solana/web3.js');
      if (!issuance.current) {
        const signer = sdk.Keypair.generate();
        const input = assetInputSchema.parse({ mint: signer.publicKey.toBase58(), kind, name, symbol, presetId });
        const document = await api<AssetDocument>('/api/assets', input);
        await Promise.all([fetch(document.uri, { signal: AbortSignal.timeout(10_000) }).then(r => { if (!r.ok) throw new Error('Immutable metadata is not readable.'); }), fetch(document.image, { signal: AbortSignal.timeout(10_000) }).then(r => { if (!r.ok) throw new Error('Immutable artwork is not readable.'); })]);
        issuance.current = { mint: signer, document, preparationSignature: null, issuanceSignature: null };
      }
      const state = issuance.current;
      const existing = await connection.current.getAccountInfo(state.mint.publicKey, 'confirmed');
      if (!existing) await chain.prepareIssuance(connection.current, EXPECTED_GENESIS, wallet.current, state, setProgress);
      const signature = await chain.finishIssuance(connection.current, EXPECTED_GENESIS, wallet.current, state, setProgress);
      await api('/api/gallery', { mint: state.document.mint, contentHash: state.document.contentHash, issuanceSignature: signature });
      setCompleted(state.document); record(state.document.kind === 'nft' ? 'Test NFT issued' : 'Meme token issued', signature, state.document.mint); await refreshBalance();
    });
  }
  async function transfer(asset: boolean) {
    await run(async () => {
      if (!wallet.current || !connection.current) throw new Error('Create your test wallet first.');
      const chain = await import('@solana-classic/chain');
      const signature = asset && completed ? await chain.transferAsset(connection.current, EXPECTED_GENESIS, wallet.current, completed, recipient, completed.kind === 'nft' ? 1n : parseUnits(amount, 6), setProgress) : await chain.transferNative(connection.current, EXPECTED_GENESIS, wallet.current, recipient, Number(parseUnits(amount, 9)), setProgress);
      record(asset ? 'Asset transferred' : 'TEST transferred', signature, asset ? completed?.mint : undefined); await refreshBalance();
    });
  }
  const locked = !!issuance.current;
  return <>
    <section className="intro"><h1>Make something<br/>worth sharing.</h1><p>A playground for memes and NFTs.</p></section>
    <section className="playground-layout">
      <div className="creation-workspace">
        <div className="asset-tabs" role="tablist" aria-label="Asset type"><button role="tab" aria-selected={kind === 'meme'} disabled={busy || locked} onClick={() => setKind('meme')}>Meme token</button><button role="tab" aria-selected={kind === 'nft'} disabled={busy || locked} onClick={() => setKind('nft')}>NFT</button></div>
        <div className="field-pair"><label>Name<input value={name} maxLength={48} disabled={busy || locked} onChange={e => setName(e.target.value)} /></label><label>Symbol<input className="mono" value={symbol} maxLength={10} disabled={busy || locked} onChange={e => setSymbol(e.target.value)} /></label></div>
        <PresetPicker selected={presetId} onChange={setPreset} disabled={busy || locked}/>
        <button className="button primary mint-button" disabled={busy || !publicKey || !canMutate || !!completed} onClick={() => { void mint(); }}>{busy ? 'Working…' : locked && !completed ? 'Resume same mint' : kind === 'nft' ? 'Mint test NFT' : 'Create meme token'}</button>
        {progress ? <Notice>{progress.message}{progress.mint ? <> <a href={'/explorer/address/' + progress.mint}>{shortAddress(progress.mint)}</a></> : null}</Notice> : null}
        {error ? <Notice danger>{error}</Notice> : null}
        {completed ? <div className="completion"><strong>{completed.name} is issued and verified.</strong><Address value={completed.mint}/><button className="text-button" onClick={() => { issuance.current = null; setCompleted(null); setProgress(null); }}>Start a new creation</button></div> : null}
      </div>
      <aside className="wallet-rail"><h2>Your test wallet</h2><p>Create a disposable wallet to get started. Reloading this page loses access to it.</p>
        {publicKey ? <><Address value={publicKey}/><button className="button outline" onClick={() => { void navigator.clipboard.writeText(publicKey).catch(() => setError('Select and copy the visible address.')); }}>Copy public address</button></> : <button className="button dark" disabled={busy} onClick={() => { void createWallet(); }}>Create test wallet</button>}
        <button className="button outline" disabled={busy || !publicKey || !canMutate} onClick={() => { void claim(); }}>Get 1 TEST</button>
        <div className="balance"><span>Balance</span><strong>{balance === null ? '—' : (balance / 1e9).toFixed(4)} TEST</strong></div><p className="mono small">TEST has no monetary value. Use it only for experimentation on the devnet.</p>
        {!canMutate ? <Notice>The network is being prepared. Test actions become available once connected.</Notice> : null}
      </aside>
    </section>
    <section className="activity"><h2>Recent activity</h2>{activity.length ? <ul>{activity.map(a => <li key={a.signature}><span>{a.label}</span><a className="mono" href={'/explorer/tx/' + a.signature}>{shortAddress(a.signature)}</a></li>)}</ul> : <p className="empty mono">Your confirmed transactions will appear here.</p>}</section>
    {publicKey ? <section className="transfer-section"><h2>Send something</h2><p>Open a second tab to create a recipient test wallet. Transfers use the actual experimental network.</p><div className="field-pair"><label>Recipient public address<input value={recipient} onChange={e => setRecipient(e.target.value)} autoComplete="off" /></label><label>Amount<input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" /></label></div><div className="button-row"><button className="button outline" disabled={busy || !canMutate} onClick={() => { void transfer(false); }}>Transfer TEST</button>{completed ? <button className="button outline" disabled={busy || !canMutate} onClick={() => { void transfer(true); }}>Transfer {completed.kind === 'nft' ? 'this NFT' : 'meme tokens'}</button> : null}</div></section> : null}
  </>;
}
