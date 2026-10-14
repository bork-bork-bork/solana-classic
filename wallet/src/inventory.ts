import { PublicKey, type AccountInfo } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, unpackAccount } from '@solana/spl-token';
export type OwnedCandidate = { mint: string; units: bigint; tokenAccounts: string[] };
export function ownedCandidates(owner: PublicKey, rows: readonly { pubkey: PublicKey; account: AccountInfo<Buffer> }[]) {
  const grouped = new Map<string, OwnedCandidate>(); let rejected = 0;
  for (const row of rows.slice(0, 50)) {
    try {
      const account = unpackAccount(row.pubkey, row.account, TOKEN_2022_PROGRAM_ID);
      if (!account.isInitialized || account.isFrozen || account.isNative || !account.owner.equals(owner)) { rejected++; continue; }
      if (account.amount === 0n) continue;
      const mint = account.mint.toBase58(); const previous = grouped.get(mint);
      if (previous) { previous.units += account.amount; previous.tokenAccounts.push(row.pubkey.toBase58()); }
      else grouped.set(mint, { mint, units: account.amount, tokenAccounts: [row.pubkey.toBase58()] });
    } catch { rejected++; }
  }
  const candidates = [...grouped.values()];
  return { candidates: candidates.slice(0, 20), rejected, scannedAccounts: Math.min(rows.length, 50), totalAccounts: rows.length, truncated: rows.length > 50 || candidates.length > 20 };
}
