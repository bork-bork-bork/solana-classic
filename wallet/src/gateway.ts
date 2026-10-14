import { API } from './display';
export const IMAGE_API = 'https://image-assets-production.up.railway.app';
export type GatewayOptions = { apiBase?: typeof API | '/_network'; origin?: string };
export function gatewayBase(options: GatewayOptions = {}) {
  if (!options.apiBase || options.apiBase === API) return API;
  if (options.apiBase !== '/_network') throw new Error('Only the fixed Classic gateway or same-origin /_network adapter is supported.');
  const origin = new URL(options.origin ?? globalThis.location?.origin ?? '');
  if (origin.origin !== origin.href.replace(/\/$/, '') || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname)))) throw new Error('The wallet adapter requires an HTTPS origin or local test origin.');
  return origin.origin + '/_network';
}
export function immutableAsset(value: string, gateway = API) {
  const url = new URL(value);
  const upload = url.origin === IMAGE_API;
  if ((url.origin !== API && !upload) || !/^\/assets\/[a-f0-9]{64}\/(metadata\.json|image\.(svg|png))$/.test(url.pathname) || (upload && url.pathname.endsWith('.svg')) || url.search || url.hash) throw new Error('Asset is outside the verified immutable Classic store.');
  if (gateway === API) { if (upload) throw new Error('Uploaded artwork requires the same-origin Classic adapter.'); return url.href; }
  if (!gateway.endsWith('/_network')) throw new Error('Invalid immutable asset adapter.');
  return new URL(gateway).origin + (upload ? '/uploaded-assets/' : '/chain-assets/') + url.pathname.slice('/assets/'.length);
}
