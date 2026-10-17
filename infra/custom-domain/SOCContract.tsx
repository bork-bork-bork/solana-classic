import { useState } from 'react';

export const SOC_MINT = 'Nuhksmxq3AZ6ZrzVHshKnQd8QTTRSXCb7a6AU7oMsoc';
export const SOC_EXPLORER = 'https://solscan.io/token/' + SOC_MINT;

export default function SOCContract() {
  const [copyState, setCopyState] = useState('');
  async function copyAddress() {
    try { await navigator.clipboard.writeText(SOC_MINT); setCopyState('Address copied'); }
    catch { setCopyState('Select the address to copy it.'); }
  }
  return <section className="soc-contract" aria-label="SOC contract address on Solana">
    <div className="soc-contract-label"><strong>SOC on Solana</strong><span>Contract address</span></div>
    <code className="soc-contract-address">{SOC_MINT}</code>
    <div className="soc-contract-actions"><button className="text-button" onClick={() => void copyAddress()}>Copy CA</button><a href={SOC_EXPLORER} target="_blank" rel="noopener noreferrer">View on Solscan</a></div>
    {copyState ? <p className="soc-contract-status" role="status">{copyState}</p> : null}
  </section>;
}
