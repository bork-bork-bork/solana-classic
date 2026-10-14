import { Buffer } from 'buffer';
Object.assign(globalThis, { Buffer });
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EXPLORER, safeArtwork } from './display';
import type { SendPlan, TestSession } from './session';
import type { GalleryEntry } from '../../packages/config/src/index';
import './styles.css';
const short = (value: string) => value.slice(0, 6) + '…' + value.slice(-6);
const mark = new URL('../../infra/custom-domain/favicon.svg', import.meta.url).href;
function App() {
  const session = useRef<TestSession | null>(null); const busyRef = useRef(false);
  const [address, setAddress] = useState(''); const [balance, setBalance] = useState<number | null>(null);
  const [network, setNetwork] = useState('Checking testnet…'); const [verified, setVerified] = useState(false);
  const [tab, setTab] = useState<'wallet'|'art'|'activity'>('wallet'); const [art, setArt] = useState<GalleryEntry[]>([]);
  const [recipient, setRecipient] = useState(''); const [amount, setAmount] = useState('0.01'); const [plan, setPlan] = useState<SendPlan | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [activity, setActivity] = useState<{ signature: string; label: string }[]>([]);
  async function getSession() { if (!session.current) { const sdk = await import('./session'); session.current = new sdk.TestSession(); } return session.current; }
  async function run(operation: () => Promise<void>) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function refresh() {
    const wallet = await getSession();
    try { const status = await wallet.verify(); setVerified(true); setNetwork('Classic testnet · slot ' + status.slot); if (wallet.address()) setBalance(await wallet.balance()); }
    catch (cause) { setVerified(false); setNetwork('Testnet unavailable'); throw cause; }
  }
  useEffect(() => { void refresh().catch(() => {}); }, []);
  const record = (signature: string, label: string) => setActivity(items => [{ signature, label }, ...items.filter(x => x.signature !== signature)].slice(0, 15));
  async function create() { const wallet = await getSession(); setAddress(wallet.create()); setBalance(null); setNotice('This session disappears when you close or reload the page.'); await refresh(); }
  async function claim() { const wallet = await getSession(); const signature = await wallet.claim(); record(signature, 'Test funds received'); await refresh(); }
  async function confirm() { if (!plan) return; const wallet = await getSession(); const signature = await wallet.send(plan, s => record(s, 'Transfer awaiting confirmation')); record(signature, 'Transfer confirmed'); setPlan(null); await refresh(); setNotice('Transfer confirmed on Classic testnet.'); }
  async function loadArt() { setTab('art'); const wallet = await getSession(); setArt(await wallet.gallery()); }
  return <main>
    <header><a className="brand" href="https://solanaclassic.net"><span className="mark"><img src={mark} alt="" width="29" height="29"/></span><span>Classic Wallet</span></a><a href="https://solanaclassic.net/roadmap">Roadmap ↗</a></header>
    <div className="intro"><span className="network"><i className={verified ? 'online' : ''}/>{network}</span><h1>Your corner<br/>of Classic.</h1><p>Memes, art and the people behind them. Together in one wallet.</p></div>
    <section className="wallet-card" aria-label="Testnet wallet"><div className="card-top"><span>Devnet</span><span>tSOC has no monetary value</span></div>
      <div className="balance"><span>Available balance</span><strong>{balance === null ? '—' : (balance / 1e9).toLocaleString(undefined, { maximumFractionDigits: 9 })}<small>tSOC</small></strong></div>
      {address ? <><a className="address" href={EXPLORER + '/address/' + address}>{address}</a><div className="actions"><button disabled={busy} onClick={() => void run(async () => { await navigator.clipboard.writeText(address); setNotice('Public address copied.'); })}>Copy address</button><button disabled={busy || !verified} onClick={() => void run(claim)}>Get test funds</button><button disabled={busy} onClick={() => void run(refresh)}>Refresh</button></div></> : <><p className="session-copy">Start with a disposable test session. Keep your real wallets separate.</p><button className="primary" disabled={busy} onClick={() => void run(create)}>Create test session</button></>}
    </section>
    <nav className="tabs" aria-label="Wallet views"><button aria-pressed={tab === 'wallet'} onClick={() => setTab('wallet')}>Send & receive</button><button aria-pressed={tab === 'art'} disabled={busy} onClick={() => void run(loadArt)}>Art & memes</button><button aria-pressed={tab === 'activity'} onClick={() => setTab('activity')}>Activity</button></nav>
    {error ? <p className="feedback error" role="alert">{error}</p> : null}{notice ? <p className="feedback" role="status">{notice}</p> : null}
    {tab === 'wallet' ? <section className="panel"><div><h2>Send a little Classic.</h2><p>Only valueless test units on the verified Classic testnet. Review the destination and fee before signing.</p></div><form onSubmit={event => { event.preventDefault(); void run(async () => { setPlan(await (await getSession()).plan(recipient, amount)); }); }}><label>Recipient address<input value={recipient} onChange={event => { setRecipient(event.target.value); setPlan(null); }} autoComplete="off" placeholder="Public wallet address" disabled={busy}/></label><label>Amount · tSOC<input value={amount} inputMode="decimal" onChange={event => { setAmount(event.target.value); setPlan(null); }} disabled={busy}/></label><button className="primary" disabled={busy || !address || !verified}>Review transfer</button></form>{plan ? <div className="review" role="region" aria-label="Transfer review"><h3>Review transfer</h3><dl><dt>To</dt><dd>{plan.recipient}</dd><dt>Amount</dt><dd>{plan.amount / 1e9} tSOC</dd><dt>Network fee</dt><dd>{plan.fee / 1e9} tSOC</dd></dl><button className="primary" disabled={busy} onClick={() => void run(confirm)}>Confirm test transfer</button><button disabled={busy} onClick={() => setPlan(null)}>Cancel</button></div> : null}</section> : null}
    {tab === 'art' ? <section className="panel art-panel"><div><h2>A little culture.</h2><p>Recent verified creations from the network gallery. These are not an inventory of your wallet holdings.</p></div>{art.length ? <div className="gallery">{art.map(entry => <a key={entry.mint} href={EXPLORER + '/address/' + entry.mint}>{safeArtwork(entry.image) ? <img src={safeArtwork(entry.image)!} alt={entry.name} loading="lazy" referrerPolicy="no-referrer"/> : <div className="art-fallback">Artwork unavailable</div>}<strong>{entry.name}</strong><span>{entry.kind === 'nft' ? 'NFT' : 'Meme token'} · {entry.symbol}</span></a>)}</div> : <p>No verified creations loaded yet.</p>}</section> : null}
    {tab === 'activity' ? <section className="panel activity-panel"><div><h2>Your session, on-chain.</h2><p>Receipts from this browser session. The explorer remains the source of transaction state.</p></div><button disabled={busy || !address || !verified} onClick={() => void run(async () => { const signature = await (await getSession()).reconcileSend(); if (signature) { record(signature, 'Transfer confirmed'); setPlan(null); setNotice('Pending transfer confirmed.'); } await refresh(); })}>Check pending transfer</button>{activity.length ? <ul>{activity.map(item => <li key={item.signature}><span>{item.label}</span><a href={EXPLORER + '/tx/' + item.signature}>{short(item.signature)} ↗</a></li>)}</ul> : <p>No transactions in this session yet.</p>}</section> : null}
    <footer><p>Prototype · keys stay in memory. Closing or reloading loses this test session.</p>{address ? <button disabled={busy} onClick={() => { session.current?.forget(); setAddress(''); setBalance(null); setPlan(null); setActivity([]); setNotice('Test session closed.'); }}>Close test session</button> : null}<a href="https://github.com/solana-classic/solana-classic/tree/main/wallet">Open-source wallet ↗</a></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
