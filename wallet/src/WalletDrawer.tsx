import { lazy, Suspense, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './drawer.css';
const Wallet = lazy(() => import('./ClassicWallet'));
const gateway = { apiBase: '/_network' as const };
// The dock stays mounted while hidden, keeping the unlocked session in memory.
export default function WalletDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null); const close = useRef<HTMLButtonElement>(null);
  const previous = useRef<HTMLElement | null>(null); const closeAction = useRef(onClose);
  useEffect(() => { closeAction.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add('classic-wallet-docked');
    close.current?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && panel.current?.contains(event.target as Node)) { event.preventDefault(); closeAction.current(); } };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.classList.remove('classic-wallet-docked'); document.removeEventListener('keydown', keydown);
      const target = previous.current;
      if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
    };
  }, [open]);
  return createPortal(<aside className="wallet-drawer-overlay" hidden={!open} ref={panel} id="classic-wallet-dialog" aria-labelledby="classic-wallet-heading">
    <div className="wallet-drawer">
      <div className="wallet-drawer-top"><h2 id="classic-wallet-heading">Classic Wallet</h2><button ref={close} type="button" aria-label="Close wallet panel" onClick={() => closeAction.current()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div className="wallet-drawer-content"><Suspense fallback={<p className="wallet-drawer-loading" role="status">Opening wallet…</p>}><Wallet gateway={gateway} presentation="drawer"/></Suspense></div>
    </div>
  </aside>, document.body);
}
