'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, NumCell } from '@/app/v1/admin/_ui/data-table';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { STATUS_LABEL, type Lead } from '@/lib/leads/types';
import { toonTelefoon, telLink } from '@/lib/leads/normaliseren';
import { toonMoment } from '@/lib/leads/werkdagen';
import type { Tab } from '@/lib/leads/server/db';
import { bulkArchiveerAction } from '../actions';
import { LeadLabels } from './labels';
import { StatusKnoppen } from './status-knoppen';

function volgendeActie(l: Lead): string {
  if (l.status === 'terugbellen' && l.volgende_actie_op) return `${toonMoment(l.volgende_actie_op)} terugbellen`;
  if (l.status === 'opvolgen') return l.opvolgmail_gestuurd_op ? `nabellen ${toonMoment(l.volgende_actie_op)}` : 'mail nog sturen';
  if (l.status === 'kans' && l.kennismaking_op) return `kennismaking ${toonMoment(l.kennismaking_op)}`;
  if (l.volgende_actie_op) return toonMoment(l.volgende_actie_op);
  return STATUS_LABEL[l.status];
}

function Sorteer({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href}>{children}</Link>;
}

export function LeadTabel({ leads, tab, sortHrefs }: { leads: Lead[]; tab: Tab; sortHrefs: Record<string, string> }) {
  const [gekozen, setGekozen] = useState<Set<string>>(new Set());
  const [bezig, setBezig] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const wissel = (id: string) => setGekozen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function archiveer() {
    setBezig(true);
    const r = await bulkArchiveerAction([...gekozen]);
    setBezig(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${r.aantal} leads gearchiveerd.`);
    setGekozen(new Set());
    router.refresh();
  }

  if (!leads.length) return <div className="ld-kaart ld-leeg">Niets in deze lijst.</div>;

  return (
    <>
      {gekozen.size ? (
        <div className="ld-bulk">
          <span>{gekozen.size} gekozen</span>
          <Button size="sm" loading={bezig} onClick={archiveer}>Archiveren</Button>
          <Button size="sm" variant="ghost" onClick={() => setGekozen(new Set())}>Selectie wissen</Button>
        </div>
      ) : null}
      <DataTable
        label="Leads"
        columns={[
          { label: <input type="checkbox" aria-label="Alles kiezen" checked={gekozen.size === leads.length} onChange={(e) => setGekozen(e.target.checked ? new Set(leads.map((l) => l.id)) : new Set())} />, width: '1%' },
          { label: <Sorteer href={sortHrefs.bedrijfsnaam}>Bedrijf</Sorteer> },
          { label: 'Branche' },
          { label: 'Telefoon' },
          { label: <Sorteer href={sortHrefs.score}>Score</Sorteer>, num: true },
          { label: <Sorteer href={sortHrefs.volgende_actie_op}>Volgende actie</Sorteer> },
          { label: <Sorteer href={sortHrefs.laatste_poging_op}>Laatste</Sorteer> },
          { label: 'Pogingen', num: true },
          { label: '', width: '1%' },
        ]}
      >
        {leads.map((l) => (
          <tr key={l.id}>
            <td><input type="checkbox" aria-label={`Kies ${l.bedrijfsnaam}`} checked={gekozen.has(l.id)} onChange={() => wissel(l.id)} /></td>
            <td>
              <Link className="ld-rij-link" href={`/v1/leads/${l.id}`}>{l.bedrijfsnaam}</Link>
              <span className="ld-sub">{l.plaats ?? ''}{l.domein ? ` · ${l.domein}` : ''}</span>
              <LeadLabels lead={l} />
            </td>
            <td>{l.niche ?? ''}</td>
            <td>{l.telefoon ? <a href={telLink(l.telefoon)}>{toonTelefoon(l.telefoon)}</a> : ''}</td>
            <NumCell>{l.score ?? '–'}</NumCell>
            <td>{volgendeActie(l)}{l.volgende_actie_notitie ? <span className="ld-sub">{l.volgende_actie_notitie}</span> : null}</td>
            <td>{l.laatste_poging_op ? toonMoment(l.laatste_poging_op) : ''}{tab === 'archief' && l.status_reden ? <span className="ld-sub">{l.status_reden}</span> : null}</td>
            <NumCell>{l.pogingen_niet_opgenomen}</NumCell>
            <td><StatusKnoppen lead={l} compact /></td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
