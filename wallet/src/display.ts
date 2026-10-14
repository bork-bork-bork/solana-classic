export const GENESIS = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
export const API = 'https://network-release-production.up.railway.app';
export const EXPLORER = 'https://solanaclassic.net/explorer';
export function safeArtwork(value: string) {
  try { const url = new URL(value); return url.origin === API && /^\/assets\/[a-f0-9]{64}\/image\.(svg|png|webp|jpg)$/.test(url.pathname) && !url.search && !url.hash ? url.href : null; } catch { return null; }
}
