import { createRoot } from 'react-dom/client';
import { ClassicWallet } from './ClassicWallet';
import type { GatewayOptions } from './gateway';
export { ClassicWallet } from './ClassicWallet';
export function mountClassicWallet(element: HTMLElement, gateway: GatewayOptions = {}) {
  const root = createRoot(element); root.render(<ClassicWallet gateway={gateway}/>); return () => root.unmount();
}
const element = document.getElementById('root');
if (element) mountClassicWallet(element, element.dataset.gateway === '/_network' ? { apiBase: '/_network' } : {});
