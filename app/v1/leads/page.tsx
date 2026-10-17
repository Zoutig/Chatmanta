import Link from 'next/link';
import { enkel } from '@/lib/leads/pagineren';
import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { LinkTabs } from '@/app/v1/_ui/tabs';
import { buttonClass } from '@/app/v1/_ui/button';
import { filterOpties, haalAfzender, isUuid, laatsteUitkomsten, lijstLeads, misschienOpschonen, tellers, voornamen, TABS, PAGINA_GROOTTE, type Tab, type LijstFilter } from '@/lib/leads/server/db';
import { bellers } from '@/lib/leads/server/inzicht';
import { ARCHIEF_REDENEN, type Lead } from '@/lib/leads/types';
import { herinneringNodig } from '@/lib/leads/werkdagen';
import { LeadTabel } from './_ui/lead-tabel';
import { NieuweLead } from './_ui/nieuwe-lead';

const TAB_LABEL: Record<Tab, string> = {
  vandaag: 'Vandaag bellen',
  terugbellen: 'Terugbellen',
  opvolgen: 'Opvolgen',
  kansen: 'Kansen',
  chatbot: 'Heeft chatbot',
  archief: 'Archief',
};

const SORTS = ['bedrijfsnaam', 'score', 'volgende_actie_op', 'laatste_poging_op', 'plaats'] as const;

/** Positief geheel getal uit een queryparameter, anders undefined. */
function getal(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

/** Leads waarvan de opvolgmail lang genoeg geleden is voor een herinnering. */
function herinneringVoor(leads: Lead[], nu = new Date()): string[] {
  return leads.filter((l) => herinneringNodig(l.opvolgmail_gestuurd_op, nu)).map((l) => l.id);
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireJorionAdmin();
  const db = getV1ServiceRoleClient();
  const sp = enkel(await searchParams);
  const tab = (TABS as string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'vandaag';
  const filter: LijstFilter = {
    tab,
    zoek: sp.q || undefined,
    niche: sp.niche || undefined,
    plaats: sp.plaats || undefined,
    minScore: getal(sp.min),
    reden: sp.reden || undefined,
    beller: isUuid(sp.beller) ? sp.beller : undefined,
    sort: (SORTS as readonly string[]).includes(sp.sort ?? '') ? (sp.sort as LijstFilter['sort']) : undefined,
    richting: sp.dir === 'asc' || sp.dir === 'desc' ? sp.dir : undefined,
    pagina: Math.max(1, getal(sp.p) ?? 1),
  };
  await misschienOpschonen(db);
  const [lijst, aantallen, opties, afzender, lijstBellers] = await Promise.all([
    lijstLeads(db, filter),
    tellers(db),
    filterOpties(db),
    tab === 'opvolgen' ? haalAfzender(db, user.id) : Promise.resolve(null),
    bellers(db),
  ]);
  const uitkomsten = await laatsteUitkomsten(db, lijst.leads.map((l) => l.id));
  const namen = await voornamen(db, [...new Set(lijst.leads.flatMap((l) => l.gebeld_door))]);
  const gebeldDoor = Object.fromEntries(lijst.leads.map((l) => [l.id, l.gebeld_door.map((u) => namen.get(u) ?? 'onbekend').join(', ')]));
  const herinneringIds = tab === 'opvolgen' ? herinneringVoor(lijst.leads) : [];
  const qs = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) u.set(k, v);
    return `/v1/leads?${u.toString()}`;
  };
  const paginas = Math.max(1, Math.ceil(lijst.totaal / PAGINA_GROOTTE));
  const belFocus = new URLSearchParams({ ...(sp.niche ? { niche: sp.niche } : {}), ...(sp.plaats ? { plaats: sp.plaats } : {}) }).toString();

  return (
    <>
      <PageHeader
        title="Leads"
        description="Wie bel je vandaag, wie moet je terugbellen en wie wacht op een mail."
        actions={
          <>
            <NieuweLead />
            <Link className={buttonClass()} href={`/v1/leads/bellen${belFocus ? `?${belFocus}` : ''}`}>
              Start bellen
            </Link>
          </>
        }
      />
      <LinkTabs
        label="Lijsten"
        active={tab}
        items={[
          ...TABS.map((t) => ({ id: t, label: TAB_LABEL[t], count: aantallen[t], href: qs({ tab: t, p: undefined, reden: undefined }) })),
          { id: 'inzicht', label: 'Inzicht', href: '/v1/leads/inzicht' },
        ]}
      />
      <form className="ld-balk" action="/v1/leads">
        <input type="hidden" name="tab" value={tab} />
        <input className="v1-input ld-balk-zoek" name="q" defaultValue={sp.q ?? ''} placeholder="Zoek op naam, website of telefoon" />
        <select className="v1-input" name="niche" defaultValue={sp.niche ?? ''} aria-label="Branche">
          <option value="">Alle branches</option>
          {opties.niches.map((n) => <option key={n}>{n}</option>)}
        </select>
        <select className="v1-input" name="plaats" defaultValue={sp.plaats ?? ''} aria-label="Plaats">
          <option value="">Alle plaatsen</option>
          {opties.plaatsen.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="v1-input" name="beller" defaultValue={sp.beller ?? ''} aria-label="Gebeld door">
          <option value="">Gebeld door: iedereen</option>
          {lijstBellers.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}
        </select>
        <input className="v1-input" name="min" type="number" min={0} max={20} defaultValue={sp.min ?? ''} placeholder="Min. score" style={{ width: 110 }} />
        {tab === 'archief' ? (
          <select className="v1-input" name="reden" defaultValue={sp.reden ?? ''} aria-label="Reden">
            <option value="">Alle redenen</option>
            {ARCHIEF_REDENEN.map((r) => <option key={r.waarde} value={r.waarde}>{r.label}</option>)}
          </select>
        ) : null}
        <button className={buttonClass({ variant: 'secondary', size: 'sm' })} type="submit">Filter</button>
        <Link className={buttonClass({ variant: 'ghost', size: 'sm' })} href={`/v1/leads?tab=${tab}`}>Wissen</Link>
      </form>
      <LeadTabel leads={lijst.leads} tab={tab} laatsteUitkomst={uitkomsten} gebeldDoor={gebeldDoor} afzender={afzender} herinneringIds={herinneringIds} sortHrefs={Object.fromEntries(SORTS.map((s) => [s, qs({ sort: s, dir: filter.sort === s && filter.richting !== 'desc' ? 'desc' : 'asc', p: undefined })]))} />
      <div className="ld-paginering">
        <span>{lijst.totaal} {lijst.totaal === 1 ? 'lead' : 'leads'} · pagina {lijst.pagina} van {paginas}</span>
        {lijst.pagina > 1 ? <Link href={qs({ p: String(lijst.pagina - 1) })}>Vorige</Link> : null}
        {lijst.pagina < paginas ? <Link href={qs({ p: String(lijst.pagina + 1) })}>Volgende</Link> : null}
      </div>
    </>
  );
}
