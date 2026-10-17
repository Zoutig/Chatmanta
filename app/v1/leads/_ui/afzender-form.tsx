'use client';

import { useState } from 'react';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import type { Afzender } from '@/lib/leads/types';
import { bewaarAfzenderAction } from '../actions';

export function AfzenderForm({ begin }: { begin: Afzender }) {
  const [a, setA] = useState(begin);
  const [bezig, setBezig] = useState(false);
  const toast = useToast();
  const veld = (k: keyof Afzender, label: string, hint?: string) => (
    <label className="v1-field">
      <span className="v1-label">{label}</span>
      <input className="v1-input" value={a[k] ?? ''} onChange={(e) => setA((x) => ({ ...x, [k]: e.target.value || (k === 'fotoUrl' ? null : '') }))} />
      {hint ? <span className="v1-hint">{hint}</span> : null}
    </label>
  );
  return (
    <form
      className="ld-kaart"
      style={{ maxWidth: 560 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBezig(true);
        const r = await bewaarAfzenderAction(a);
        setBezig(false);
        if (r.ok) toast.success('Opgeslagen.');
        else toast.error(r.error);
      }}
    >
      {veld('naam', 'Volledige naam', 'Zo staat hij in de handtekening.')}
      {veld('voornaam', 'Voornaam', 'Onder "Groet,".')}
      {veld('functie', 'Functie')}
      {veld('telefoon', 'Telefoon')}
      {veld('email', 'E-mail')}
      {veld('fotoUrl', 'Foto (https-link, optioneel)', 'Bijvoorbeeld https://www.chatmanta.nl/mail/foto.png. Leeg = handtekening zonder foto.')}
      <div><Button type="submit" loading={bezig}>Opslaan</Button></div>
    </form>
  );
}
