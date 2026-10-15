import SOCContract from './SOCContract';

export default function Token() {
  return <section className="page-section token-page">
    <h1>One token.<br/>A network ahead.</h1>
    <p className="lead">SOC on Solana is the original token. Native SOC on Solana Classic is planned, with a proposed 1:1 reserve-backed bridge connecting the two networks.</p>
    <SOCContract/>
    <div className="token-comparison">
      <article><h2>SOC</h2><p>Original token on Solana</p><p>Use the full contract address above to identify SOC. Solana Classic mainnet and redemption through the proposed bridge are not live.</p><a href="https://github.com/solana-classic/solana-classic#team-wallet-and-supply-disclosure" target="_blank" rel="noopener noreferrer">Team wallet and supply disclosure</a></article>
      <article><h2>tSOC</h2><p>Native test units on Classic devnet</p><p>For minting, transfers and testing in the playground. tSOC has no monetary value. Test balances carry no promised allocation or conversion into SOC.</p><a href="/playground">Use the playground</a></article>
    </div>
    <div className="reading-copy"><h2>One economic supply</h2><p>The proposed bridge would lock original SOC on Solana and release a matching amount from a reserved native SOC balance on Solana Classic. Returning native SOC to the reserve would allow the original tokens to be unlocked.</p><p>Mainnet, reserve custody, bridge security and conversion terms require their own implementation, verification and release decisions. There is no active bridge or redemption service today.</p><a href="/whitepaper">Read the whitepaper</a></div>
  </section>;
}
