import { useEffect, useState } from 'react';
import Playground from './Playground';
import { Home, Gallery, Explorer, Network, Token } from './Pages';
import { useNetwork } from './useNetwork';
const routes = [['/playground', 'Playground'], ['/gallery', 'Gallery'], ['/explorer', 'Explorer'], ['/network', 'Network'], ['/token', 'Token']];
export default function App() {
  const [path, setPath] = useState(window.location.pathname); const network = useNetwork();
  useEffect(() => {
    const navigate = () => { setPath(window.location.pathname); window.scrollTo(0, 0); };
    const click = (event: MouseEvent) => { const anchor = (event.target as Element)?.closest('a'); if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || anchor.hasAttribute('download') || anchor.target) return; const url = new URL(anchor.href); if (url.origin !== window.location.origin || !(/^\/(playground|gallery|explorer|network|token)(\/|$)/.test(url.pathname) || url.pathname === '/')) return; event.preventDefault(); window.history.pushState({}, '', url.pathname + url.search); navigate(); };
    window.addEventListener('popstate', navigate); document.addEventListener('click', click); return () => { window.removeEventListener('popstate', navigate); document.removeEventListener('click', click); };
  }, []);
  const playground = path === '/playground';
  return <div className="site-shell"><a className="skip-link" href="#main-content">Skip to content</a><header className="site-header"><a href="/" className="brand"><span className="brand-mark" aria-hidden="true"/>Solana Classic</a><nav aria-label="Main navigation">{routes.map(([href, text]) => <a key={href} href={href} className={path.startsWith(href!) ? 'active' : ''} aria-current={path.startsWith(href!) ? 'page' : undefined}>{text}</a>)}</nav></header><div className="network-strip"><span>Experimental devnet · 1 operator · TEST has no monetary value</span><span className="connection-status"><span className={'status-dot ' + network.status.state}/>{network.status.state === 'online' ? 'Network responding' : network.status.state === 'degraded' ? 'Network unavailable' : 'Connection pending'}</span></div><main id="main-content"><div hidden={!playground}><Playground canMutate={network.canMutate}/></div>{path === '/' ? <Home/> : path === '/gallery' ? <Gallery/> : path.startsWith('/explorer') ? <Explorer path={path}/> : path === '/network' ? <Network facts={network.facts} status={network.status}/> : path === '/token' ? <Token/> : !playground ? <section className="page-section"><h1>Page not found.</h1><a href="/playground">Back to the playground</a></section> : null}</main><footer className="site-footer"><span>Open to everyone. Built for memes and NFTs.</span><a href="/token">SOC: launch and mainnet planned</a></footer></div>;
}
