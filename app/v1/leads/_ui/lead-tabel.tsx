'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, NumCell } from '@/app/v1/admin/_ui/data-table';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { STATUS_LABEL, UITKOMST_LABEL, archiefRedenLabel, type Afzender, type Lead, type Uitkomst } from '@/lib/leads/types';
import { toonTelefoon, telLink } from '@/lib/leads/normaliseren';
import { toonMoment } from '@/lib/leads/werkdagen';
import type { Tab } from '@/lib/leads/server/db';
import { bulkArchiveerAction } from '../actions';
import { LeadLabels } from './labels';
import { StatusKnoppen } from './status-knoppen';
import { DetailMail } from './detail-mail';

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

export function LeadTabel({
  leads,
  tab,
  sortHrefs,
  laatsteUitkomst,
  gebeldDoor,
  afzender,
  herinneringIds,
}: {
  leads: Lead[];
  tab: Tab;
  sortHrefs: Record<string, string>;
  /** Laatste niet-ongedane belpoging-uitkomst per lead-id (alleen de leads van deze pagina). */
  laatsteUitkomst: Partial<Record<string, Uitkomst>>;
  /** Voornamen van wie de lead gebeld heeft, per lead-id. */
  gebeldDoor: Record<string, string>;
  /** Voor de knop "Herinnering sturen" in Opvolgen. */
  afzender: Afzender | null;
  /** Leads in Opvolgen waarvan de opvolgmail 3+ werkdagen oud is (server-side bepaald). */
  herinneringIds: string[];
}) {
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
    toast.success(`${r.aantal} ${r.aantal === 1 ? 'lead' : 'leads'} gearchiveerd.`);
    setGekozen(new Set());
    router.refresh();
  }

  if (!leads.length) return <div className="ld-kaart ld-leeg">Niets in deze lijst.</div>;

  const kansen = tab === 'kansen';
  const columns = [
    { label: <input type="checkbox" aria-label="Alles kiezen" checked={gekozen.size === leads.length} onChange={(e) => setGekozen(e.target.checked ? new Set(leads.map((l) => l.id)) : new Set())} />, width: '1%' },
    { label: <Sorteer href={sortHrefs.bedrijfsnaam}>Bedrijf</Sorteer> },
    { label: 'Branche' },
    { label: 'Telefoon' },
    { label: <Sorteer href={sortHrefs.score}>Score</Sorteer>, num: true },
    { label: <Sorteer href={sortHrefs.volgende_actie_op}>Volgende actie</Sorteer> },
    ...(kansen ? [{ label: 'Kennismaking' }, { label: 'Mail' }] : []),
    { label: 'Gebeld door' },
    { label: <Sorteer href={sortHrefs.laatste_poging_op}>Laatste uitkomst</Sorteer> },
    { label: 'Pogingen', num: true },
    { label: '', width: '1%' },
  ];

  const rij = (l: Lead) => {
    const uitkomst = laatsteUitkomst[l.id];
    const herinnering = tab === 'opvolgen' && herinneringIds.includes(l.id);
    return (
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
        {kansen ? (
          <>
            <td>{l.kennismaking_op ? toonMoment(l.kennismaking_op) : 'nog niet gepland'}</td>
            <td>{l.opvolgmail_gestuurd_op ? <>ja<span className="ld-sub">{toonMoment(l.opvolgmail_gestuurd_op)}</span></> : 'nee'}</td>
          </>
        ) : null}
        <td>{gebeldDoor[l.id] ?? ''}</td>
        <td>
          {uitkomst ? UITKOMST_LABEL[uitkomst] : ''}
          {l.laatste_poging_op ? <span className="ld-sub">{toonMoment(l.laatste_poging_op)}</span> : null}
          {tab === 'archief' && l.status_reden ? <span className="ld-sub">{archiefRedenLabel(l.status_reden)}</span> : null}
        </td>
        <NumCell>{l.pogingen_niet_opgenomen}</NumCell>
        <td>
          <div className="ld-rij-acties">
            {herinnering ? <DetailMail lead={l} afzender={afzender} situatie="herinnering" label="Herinnering sturen" klein /> : null}
            <StatusKnoppen lead={l} compact />
          </div>
        </td>
      </tr>
    );
  };

  const groepKop = (titel: string, n: number) => (
    <tr key={`kop-${titel}`} className="ld-groep-kop">
      <th colSpan={columns.length} scope="colgroup">{titel} <span className="ld-sub" style={{ display: 'inline' }}>({n})</span></th>
    </tr>
  );

  let inhoud: React.ReactNode;
  if (tab === 'opvolgen') {
    const nog = leads.filter((l) => !l.opvolgmail_gestuurd_op);
    const gemaild = leads.filter((l) => l.opvolgmail_gestuurd_op);
    inhoud = (
      <>
        {nog.length ? [groepKop('Mail nog sturen', nog.length), ...nog.map(rij)] : null}
        {gemaild.length ? [groepKop('Gemaild, nabellen', gemaild.length), ...gemaild.map(rij)] : null}
      </>
    );
  } else inhoud = leads.map(rij);

  return (
    <>
      {gekozen.size ? (
        <div className="ld-bulk">
          <span>{gekozen.size} gekozen</span>
          <Button size="sm" loading={bezig} onClick={archiveer}>Archiveren</Button>
          <Button size="sm" variant="ghost" onClick={() => setGekozen(new Set())}>Selectie wissen</Button>
        </div>
      ) : null}
      <DataTable label="Leads" columns={columns}>
        {inhoud}
      </DataTable>
    </>
  );
}
