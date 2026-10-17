'use client';

import { useRef, useState } from 'react';
import { useToast } from '@/app/v1/_ui/toast';
import type { BewerkbaarVeld, Lead } from '@/lib/leads/types';
import { toonTelefoon } from '@/lib/leads/normaliseren';
import { werkVeldenBijAction } from '../actions';

type VeldDef = { veld: BewerkbaarVeld; label: string; meerregelig?: boolean; placeholder?: string };

export const BEL_VELDEN: VeldDef[] = [
  { veld: 'contactpersoon', label: 'Contactpersoon', placeholder: 'Naam eigenaar' },
  { veld: 'haakje', label: 'Haakje / compliment', placeholder: 'Waar ze veel vragen over krijgen, iets moois op hun site' },
  { veld: 'notitie', label: 'Notitie', meerregelig: true },
];

export const ALLE_VELDEN: VeldDef[] = [
  { veld: 'bedrijfsnaam', label: 'Bedrijfsnaam' },
  { veld: 'website_url', label: 'Website' },
  { veld: 'telefoon', label: 'Telefoon' },
  { veld: 'email', label: 'E-mail' },
  { veld: 'niche', label: 'Branche' },
  { veld: 'plaats', label: 'Plaats' },
  ...BEL_VELDEN,
];

/** Telefoon staat als E.164 in de database; in het veld tonen we de leesbare vorm. */
const toon = (l: Lead, k: BewerkbaarVeld): string => (k === 'telefoon' ? toonTelefoon(l.telefoon) : String(l[k] ?? ''));

export function LeadVelden({ lead, velden, onOpgeslagen }: { lead: Lead; velden: VeldDef[]; onOpgeslagen?: (l: Lead) => void }) {
  const toast = useToast();
  const [waarden, setWaarden] = useState<Record<string, string>>(() =>
    Object.fromEntries(velden.map((v) => [v.veld, toon(lead, v.veld)])),
  );
  const [vorm, setVorm] = useState(lead.aanspreekvorm);
  // Laatst bekende opgeslagen waarde per veld (de prop wordt niet ververst na opslaan).
  const opgeslagen = useRef<Record<string, string>>(
    Object.fromEntries([...velden.map((v) => v.veld), 'aanspreekvorm'].map((k) => [k, toon(lead, k as BewerkbaarVeld)])),
  );

  async function bewaar(veld: BewerkbaarVeld, waarde: string) {
    if (waarde === opgeslagen.current[veld]) return;
    const r = await werkVeldenBijAction(lead.id, { [veld]: waarde });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    // De server normaliseert (bv. telefoon): toon wat er echt staat.
    const echt = toon(r.lead, veld);
    opgeslagen.current[veld] = echt;
    if (veld !== 'aanspreekvorm') setWaarden((w) => ({ ...w, [veld]: echt }));
    onOpgeslagen?.(r.lead);
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {velden.map((v) => (
        <label key={v.veld} className="v1-field">
          <span className="v1-label">{v.label}</span>
          {v.meerregelig ? (
            <textarea
              className="v1-input"
              rows={3}
              value={waarden[v.veld]}
              placeholder={v.placeholder}
              onChange={(e) => setWaarden((w) => ({ ...w, [v.veld]: e.target.value }))}
              onBlur={(e) => bewaar(v.veld, e.target.value)}
            />
          ) : (
            <input
              className="v1-input"
              value={waarden[v.veld]}
              placeholder={v.placeholder}
              onChange={(e) => setWaarden((w) => ({ ...w, [v.veld]: e.target.value }))}
              onBlur={(e) => bewaar(v.veld, e.target.value)}
            />
          )}
        </label>
      ))}
      <div className="v1-field">
        <span className="v1-label">Aanspreken met</span>
        <div className="ld-chips">
          {(['je', 'u'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className="ld-chip"
              aria-pressed={vorm === f}
              onClick={() => {
                setVorm(f);
                void bewaar('aanspreekvorm', f);
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
