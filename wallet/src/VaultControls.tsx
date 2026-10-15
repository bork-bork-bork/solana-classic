import { useState } from 'react';
type Props = { address: string; saved: boolean; busy: boolean; save: (password: string) => Promise<void>; unlock: (password: string) => Promise<void>; lock: () => void; remove: () => Promise<void> };
export default function VaultControls({ address, saved, busy, save, unlock, lock, remove }: Props) {
  const [editing, setEditing] = useState(false); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [removing, setRemoving] = useState(false); const [error, setError] = useState('');
  async function submit() {
    setError('');
    if (!saved && password !== confirm) { setError('Passwords do not match.'); return; }
    const value = password; setPassword(''); setConfirm('');
    try { if (saved) await unlock(value); else { await save(value); setEditing(false); } } catch (cause) { setError(cause instanceof Error ? cause.message : 'Saved wallet action failed.'); }
  }
  if (!saved && !address) return null;
  return <section className="vault-controls" aria-label="Saved test wallet">
    {saved && !address ? <><h3>Unlock your test wallet</h3><p>Your encrypted wallet is saved in this browser. Enter your password to use the same address.</p></> : saved ? <><strong>Saved in this browser</strong><p>Encrypted at rest. Refresh locks it until you enter your password.</p></> : <><strong>Keep this test wallet after refresh</strong><p>Save it encrypted in this browser with your own password.</p></>}
    {(!saved && editing) || (saved && !address) ? <form onSubmit={event => { event.preventDefault(); void submit(); }}><label>{saved ? 'Password' : 'Choose a password'}<input type="password" autoComplete={saved ? 'current-password' : 'new-password'} minLength={12} maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} required/></label>{!saved ? <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirm} disabled={busy} onChange={event => setConfirm(event.target.value)} required/></label> : null}<p className="vault-warning">There is no password recovery. Clearing browser data or losing this password loses access. Test assets only.</p><button className="primary" disabled={busy}>{saved ? 'Unlock wallet' : 'Save this test wallet'}</button>{!saved ? <button type="button" disabled={busy} onClick={() => { setEditing(false); setPassword(''); setConfirm(''); setError(''); }}>Cancel</button> : null}</form> : !saved ? <button disabled={busy} onClick={() => setEditing(true)}>Save this test wallet</button> : <div className="vault-actions"><button disabled={busy} onClick={lock}>Lock wallet</button><button disabled={busy} onClick={() => setRemoving(value => !value)}>Remove saved wallet</button></div>}
    {removing ? <div className="vault-remove"><p>Remove this browser's encrypted copy and close the session? Access will be lost. Pending transactions must be reconciled first.</p><button disabled={busy} onClick={() => { void remove().then(() => setRemoving(false)).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not remove saved wallet.')); }}>Confirm removal</button><button disabled={busy} onClick={() => setRemoving(false)}>Cancel</button></div> : null}
    {error ? <p role="alert" className="feedback error">{error}</p> : null}
  </section>;
}
