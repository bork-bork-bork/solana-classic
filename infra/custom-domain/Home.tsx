export default function Home() {
  return <>
    <section className="classic-home-hero">
      <h1>Bring back<br/>the fun.</h1>
      <div className="classic-home-intro">
        <p>Solana Classic is an independent blockchain project for art, NFTs and memes. We want the people making the culture to have a say in what gets built around it.</p>
        <div className="button-row">
          <a className="button primary" href="/playground">Try the playground</a>
          <a className="home-paper-link" href="/whitepaper">Read the whitepaper</a>
        </div>
      </div>
    </section>
    <section className="classic-home-story">
      <div><h2>We came for the art.<br/>We stayed for the people.</h2><p>A collection, a joke, a group chat that became something more. That is the part of Solana we want to keep building for.</p><a href="/about">Why Solana Classic</a></div>
      <div className="classic-home-play"><h2>Start with something you made.</h2><p>Create a test wallet, get tSOC and mint an image or a meme asset. Send it to another wallet, find it in the gallery and follow its receipt in the explorer.</p><p className="home-test-note">Devnet is live. The Solana Classic team runs its single validator - the computer that checks and records transactions. tSOC and test assets have no monetary value. SOC mainnet and the proposed bridge are future work.</p><a href="/gallery">See the gallery</a><a href="/network">Network details</a></div>
    </section>
  </>;
}
