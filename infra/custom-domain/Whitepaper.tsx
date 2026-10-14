import edition from './whitepaper-edition.json';

export default function Whitepaper() {
  return <section className="whitepaper-page" aria-labelledby="whitepaper-title">
    <div className="whitepaper-heading">
      <div>
        <p className="culture-kicker">SHARED ROOTS. OUR OWN DIRECTION.</p>
        <h1 id="whitepaper-title">Whitepaper</h1>
        <p className="whitepaper-intro">Our vision for a chain built around art, NFTs, memes and the communities behind them.</p>
      </div>
      <div className="whitepaper-actions">
        <a href="/whitepaper.pdf" target="_blank" rel="noopener noreferrer" className="button">Open PDF ↗</a>
        <a href="/whitepaper.pdf" download="Solana_Classic_Whitepaper.pdf">Download PDF</a>
      </div>
    </div>
    <div className="whitepaper-reader">
      <div className="whitepaper-reader-label"><span>Solana Classic</span><span>Edition {edition.version} · {edition.pages} pages</span></div>
      <iframe src="/pdf-reader/reader.html" title="Solana Classic whitepaper PDF reader" />
    </div>
    <p className="whitepaper-reader-note">Read, scroll and zoom above. Prefer a full-screen view? <a href="/pdf-reader/reader.html" target="_blank" rel="noopener noreferrer">Open the reader ↗</a></p>
  </section>;
}
