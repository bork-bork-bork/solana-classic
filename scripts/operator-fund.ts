import { readFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { assertNetwork, submitInstructions } from '@solana-classic/chain';
const expected = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
if (process.env.RAILWAY_PROJECT_ID !== '356bcb0b-49c4-4bd3-bf10-bff7db8f33fe' || process.env.RAILWAY_SERVICE_ID !== 'd0a1de40-bd9c-47eb-a7fc-477f1c55b2d6') throw new Error('Operator funding is confined to the designated TEST service.');
const plan = JSON.parse(readFileSync('/data/operator/qa-funding-public.json', 'utf8')) as { genesis: string; wallets: { publicKey: string; lamports: number }[]; funder: { publicKey: string; lamports: number } };
if (plan.genesis !== expected || plan.wallets.length !== 20) throw new Error('Funding plan identity/session count mismatch.');
const connection = new Connection('http://127.0.0.1:8899', 'confirmed'); await assertNetwork(connection, expected);
const operator = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('/data/operator/bootstrap.json', 'utf8')) as number[]));
for (const target of [...plan.wallets, plan.funder]) {
  if (!Number.isSafeInteger(target.lamports) || target.lamports <= 0 || target.lamports > 6_000_000_000) throw new Error('Invalid bounded TEST funding amount.');
  const destination = new PublicKey(target.publicKey);
  const balance = await connection.getBalance(destination, 'confirmed');
  if (balance >= target.lamports) continue; // Restart/retry cannot double the requested prefunding.
  const signature = await submitInstructions(connection, expected, operator, [SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: destination, lamports: target.lamports - balance })]);
  console.log(JSON.stringify({ publicKey: target.publicKey, signature, targetLamports: target.lamports, scope: 'operator prefunding of valueless TEST QA accounts; public faucet limits unchanged' }));
}
