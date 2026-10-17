'use client';

import { useEffect, useState } from 'react';
import { Dialoog } from './dialoog';
import { STATUS_LABEL } from '@/lib/leads/types';
import { toonTelefoon } from '@/lib/leads/normaliseren';
import type { ZoekLead } from '@/lib/leads/server/db';
import { zoekLeadsAction } from '../actions';

/** "Belde ons terug": zoek het bedrijf dat belde en kies het. */
export function TerugbelZoeker({ open, onSluit, onKies }: { open: boolean; onSluit: () => void; onKies: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<ZoekLead[]>([]);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes([]);
      return;
    }
    let weg = false;
    const t = setTimeout(async () => {
      const r = await zoekLeadsAction(q);
      if (weg) return;
      if (r.ok) {
        setRes(r.leads);
        setFout(null);
      } else setFout(r.error);
    }, 250);
    return () => {
      weg = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <Dialoog open={open} titel="Wie belde ons terug?" onSluit={onSluit}>
      <input className="v1-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op bedrijfsnaam, website of telefoon" aria-label="Zoek bedrijf" />
      {fout ? <p className="v1-hint">{fout}</p> : null}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {res.map((l) => (
          <li key={l.id}>
            <button type="button" className="ld-uitkomst" style={{ width: '100%', textAlign: 'left' }} onClick={() => { setQ(''); setRes([]); onKies(l.id); }}>
              {l.bedrijfsnaam}
              <span className="ld-sub">{[l.plaats, l.telefoon ? toonTelefoon(l.telefoon) : l.domein, STATUS_LABEL[l.status]].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))}
        {q.trim().length >= 2 && !res.length && !fout ? <li className="v1-hint">Niets gevonden.</li> : null}
      </ul>
    </Dialoog>
  );
}
