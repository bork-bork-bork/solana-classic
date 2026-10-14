import { useEffect, useRef, useState } from 'react';
import GitHubLink from './GitHubLink';

type Props = { path: string; routes: readonly (readonly string[])[] };
const primaryPaths = new Set(['/wallet', '/playground', '/gallery', '/explorer']);

export default function SiteHeader({ path, routes }: Props) {
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false);
    };
    const resize = () => { if (window.innerWidth > 1100) setOpen(false); };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  const link = ([href, text]: readonly string[]) => <a key={href} href={href}
    className={path.startsWith(href!) ? 'active' : ''}
    aria-current={path.startsWith(href!) ? 'page' : undefined}
    onClick={() => setOpen(false)}>{text}</a>;

  return <header className="site-header" ref={header}>
    <a href="/" className="brand" onClick={() => setOpen(false)}><span className="brand-logo" aria-hidden="true"/>Solana Classic</a>
    <nav className="desktop-navigation" aria-label="Main navigation">{routes.map(link)}<GitHubLink/></nav>
    <button ref={toggle} className="mobile-menu-toggle" type="button" aria-expanded={open}
      aria-controls="mobile-navigation" onClick={() => setOpen(value => !value)}>
      {open ? 'Close' : 'Menu'}<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 8h16M4 16h16'}/>
      </svg>
    </button>
    <nav id="mobile-navigation" className="mobile-navigation" aria-label="Mobile navigation" hidden={!open}>
      <div className="mobile-nav-primary">{routes.filter(([href]) => primaryPaths.has(href!)).map(link)}</div>
      <div className="mobile-nav-secondary">{routes.filter(([href]) => !primaryPaths.has(href!)).map(link)}<GitHubLink/></div>
    </nav>
  </header>;
}
