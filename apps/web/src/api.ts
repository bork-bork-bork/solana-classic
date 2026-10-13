export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
export const EXPECTED_GENESIS = import.meta.env.VITE_EXPECTED_GENESIS_HASH ?? '';
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!API_BASE) throw new Error('The experimental network is being prepared. Test actions are not connected yet.');
  const response = await fetch(API_BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'The network could not complete this request.');
  return result as T;
}
export async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const result = await api<{ result: T; error?: { message: string } }>('/api/rpc', { jsonrpc: '2.0', id: crypto.randomUUID(), method, params });
  if (result.error) throw new Error(result.error.message);
  return result.result;
}
export function parseUnits(value: string, decimals: number): bigint {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(value)) throw new Error(`Enter a positive amount with at most ${decimals} decimal places.`);
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'));
  if (amount <= 0n) throw new Error('Enter a positive amount.');
  return amount;
}
export function shortAddress(value: string) { return value.slice(0, 7) + '…' + value.slice(-7); }
