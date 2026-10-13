import type { ReactNode } from 'react';
import { PRESETS, presetSvg } from '@solana-classic/config';
export function PresetArt({ id }: { id: number }) { return <div className="preset-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: presetSvg(id) }} />; }
export function PresetPicker({ selected, onChange, disabled }: { selected: number; onChange: (id: number) => void; disabled?: boolean }) {
  return <fieldset className="preset-field"><legend>Choose a geometric preset</legend><div className="preset-grid">{PRESETS.map(p => <button key={p.id} type="button" aria-pressed={selected === p.id} aria-label={p.name} className={'preset-choice ' + (p.id === selected ? 'selected' : '')} disabled={disabled} onClick={() => onChange(p.id)}><PresetArt id={p.id}/><span>{String(p.id + 1).padStart(2, '0')} {p.name}</span></button>)}</div></fieldset>;
}
export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) { return <p role={danger ? 'alert' : 'status'} className={'notice ' + (danger ? 'danger' : '')}>{children}</p>; }
export function Address({ value }: { value: string }) { return <code className="address">{value}</code>; }
