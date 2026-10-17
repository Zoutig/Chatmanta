'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import type { Lead } from '@/lib/leads/types';
import type { HandmatigeStatus } from '@/lib/leads/volgende-stand';
import { zetStatusAction } from '../actions';

export function StatusKnoppen({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  const [bezig, setBezig] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  async function zet(naar: HandmatigeStatus, reden: string | null = null) {
    setBezig(naar);
    const r = await zetStatusAction(lead.id, naar, reden);
    setBezig(null);
    if (!r.ok) return toast.error(r.error);
    toast.success('Opgeslagen.');
    router.refresh();
  }

  const s = lead.status;
  const knoppen: { naar: HandmatigeStatus; label: string; reden?: string }[] = [];
  if (s === 'kans') knoppen.push({ naar: 'klant', label: 'Klant geworden' }, { naar: 'geen_interesse', label: 'Afgehaakt', reden: 'afgehaakt' });
  if (s === 'geen_interesse' || s === 'niet_bellen' || s === 'archief' || s === 'heeft_chatbot') knoppen.push({ naar: 'open', label: 'Terug naar open' });
  else knoppen.push({ naar: 'archief', label: 'Archiveren' });
  if (s !== 'niet_bellen') knoppen.push({ naar: 'niet_bellen', label: 'Niet bellen', reden: 'handmatig' });

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: compact ? 'nowrap' : 'wrap' }}>
      {s === 'open' || s === 'terugbellen' || s === 'opvolgen' ? (
        <Link className="v1-btn v1-btn--secondary v1-btn--sm" href={`/v1/leads/bellen?lead=${lead.id}`}>Bel nu</Link>
      ) : null}
      {knoppen.map((k) => (
        <Button key={k.naar} size="sm" variant="ghost" loading={bezig === k.naar} onClick={() => zet(k.naar, k.reden ?? null)}>
          {k.label}
        </Button>
      ))}
    </div>
  );
}
