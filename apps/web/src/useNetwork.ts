import { useEffect, useState } from 'react';
import type { NetworkFacts, NetworkStatus } from '@solana-classic/config';
import { API_BASE, EXPECTED_GENESIS, api } from './api';
export function useNetwork() {
  const [facts, setFacts] = useState<NetworkFacts | null>(null);
  const [status, setStatus] = useState<NetworkStatus>({ state: 'unconfigured', slot: null, genesisMatches: false, lastProgressAt: null, message: 'Connection pending' });
  useEffect(() => {
    if (!API_BASE) return;
    let active = true;
    const load = async () => {
      try { const [f, s] = await Promise.all([api<NetworkFacts>('/api/network'), api<NetworkStatus>('/api/status')]); if (active) { setFacts(f); setStatus(s); } }
      catch { if (active) setStatus({ state: 'degraded', slot: null, genesisMatches: false, lastProgressAt: null, message: 'Network unavailable. Actions are paused.' }); }
    };
    void load(); const timer = setInterval(() => { void load(); }, 15_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const canMutate = status.state === 'online' && status.genesisMatches && !!EXPECTED_GENESIS && facts?.expectedGenesisHash === EXPECTED_GENESIS;
  return { facts, status, canMutate };
}
