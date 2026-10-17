'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { Dialoog } from './dialoog';
import { nieuweLeadAction } from '../actions';

export function NieuweLead() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ bedrijfsnaam: '', website: '', telefoon: '', niche: '', plaats: '' });
  const [bezig, setBezig] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function opslaan() {
    setBezig(true);
    const r = await nieuweLeadAction(v);
    setBezig(false);
    if (!r.ok) return toast.error(r.error);
    setOpen(false);
    if (r.bestond) toast.error('Deze lead bestond al. Je ziet nu de bestaande.');
    else toast.success('Lead toegevoegd.');
    router.push(`/v1/leads/${r.id}`);
  }

  const veld = (k: keyof typeof v, label: string, placeholder = '') => (
    <label className="v1-field">
      <span className="v1-label">{label}</span>
      <input className="v1-input" value={v[k]} placeholder={placeholder} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />
    </label>
  );

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>+ Lead</Button>
      <Dialoog open={open} titel="Lead toevoegen" onSluit={() => setOpen(false)} voet={<Button loading={bezig} onClick={opslaan}>Toevoegen</Button>}>
        {veld('bedrijfsnaam', 'Bedrijfsnaam')}
        {veld('website', 'Website', 'jansen-bouw.nl')}
        {veld('telefoon', 'Telefoon', '06 12345678')}
        {veld('niche', 'Branche', 'installateur')}
        {veld('plaats', 'Plaats', 'Ede')}
      </Dialoog>
    </>
  );
}
