import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors/app-error';
import type { Activiteit, Afzender, BewerkbaarVeld, Lead, LeadStatus, Stand, Uitkomst, ActiviteitSoort } from '../types';
import { pakStand } from '../types';
import { beginVanMorgen } from '../werkdagen';
import { begrensPagina, leesAllePaginas } from '../pagineren';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (x: unknown): x is string => typeof x === 'string' && UUID_RE.test(x);

export const PAGINA_GROOTTE = 50;
export const CLAIM_MINUTEN = 10;

export type Tab = 'vandaag' | 'terugbellen' | 'opvolgen' | 'kansen' | 'chatbot' | 'archief';
export const TABS: Tab[] = ['vandaag', 'terugbellen', 'opvolgen', 'kansen', 'chatbot', 'archief'];

export type LijstFilter = {
  tab: Tab;
  zoek?: string;
  niche?: string;
  plaats?: string;
  minScore?: number;
  reden?: string;
  sort?: 'bedrijfsnaam' | 'score' | 'volgende_actie_op' | 'laatste_poging_op' | 'plaats';
  richting?: 'asc' | 'desc';
  pagina?: number;
};

function fout(message: string, cause?: unknown): never {
  throw new AppError('INTERNAL', { message, cause });
}

// supabase-js query-builder; bewust losjes getypt zodat één helper alle tabs kan filteren.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterTab(q: any, tab: Tab, nu: Date) {
  const morgen = beginVanMorgen(nu).toISOString();
  switch (tab) {
    case 'vandaag':
      return q.in('status', ['open', 'terugbellen']).or(`volgende_actie_op.is.null,volgende_actie_op.lt.${morgen}`);
    case 'terugbellen':
      return q.eq('status', 'terugbellen').gte('volgende_actie_op', morgen);
    case 'opvolgen':
      return q.eq('status', 'opvolgen');
    case 'kansen':
      return q.in('status', ['kans', 'klant']);
    case 'chatbot':
      return q.eq('status', 'heeft_chatbot');
    case 'archief':
      return q.in('status', ['geen_interesse', 'niet_bellen', 'archief']);
  }
}

/** Zoekterm veilig voor een PostgREST or()-filter: geen komma's, haakjes of wildcards. */
export function veiligeZoekterm(q: string): string {
  return q.replace(/[,()%*\\]/g, ' ').trim().slice(0, 80);
}

/** Tab + zoek + filters op een leads-query (zonder sortering/paginering). */
function gefilterd(db: SupabaseClient, f: LijstFilter, nu: Date, head: boolean) {
  let q = db.from('leads').select('*', { count: 'exact', head });
  q = filterTab(q, f.tab, nu);
  if (f.zoek) {
    const z = veiligeZoekterm(f.zoek);
    const cijfers = z.replace(/\D/g, '');
    const delen = [`bedrijfsnaam.ilike.%${z}%`, `domein.ilike.%${z}%`];
    if (cijfers.length >= 4) delen.push(`telefoon.ilike.%${cijfers.replace(/^0/, '')}%`);
    if (z) q = q.or(delen.join(','));
  }
  if (f.niche) q = q.eq('niche', f.niche);
  if (f.plaats) q = q.eq('plaats', f.plaats);
  if (f.minScore !== undefined) q = q.gte('score', f.minScore);
  if (f.reden) q = q.eq('status_reden', f.reden);
  return q;
}

/**
 * Eén pagina van de lijst. Een pagina voorbij het einde (PostgREST: 416 / PGRST103) wordt de
 * laatste pagina; de pagina in het antwoord is dus altijd 1..aantal pagina's.
 */
export async function lijstLeads(db: SupabaseClient, f: LijstFilter, nu = new Date()) {
  const sort = f.sort ?? (f.tab === 'vandaag' ? 'score' : 'volgende_actie_op');
  const asc = (f.richting ?? (sort === 'score' ? 'desc' : 'asc')) === 'asc';
  const haal = (pagina: number) =>
    gefilterd(db, f, nu, false)
      .order(sort, { ascending: asc, nullsFirst: false })
      .order('id')
      .range((pagina - 1) * PAGINA_GROOTTE, pagina * PAGINA_GROOTTE - 1);

  let pagina = Math.max(1, Math.floor(f.pagina ?? 1));
  let { data, count, error } = await haal(pagina);
  const voorbij = pagina > 1 && (error?.code === 'PGRST103' || (!error && !(data ?? []).length && (count ?? 0) > 0));
  if (voorbij) {
    const { count: totaal, error: e } = await gefilterd(db, f, nu, true);
    if (e) fout(`leads tellen faalde: ${e.message}`, e);
    pagina = begrensPagina(pagina, totaal ?? 0, PAGINA_GROOTTE);
    ({ data, count, error } = await haal(pagina));
  }
  if (error) fout(`leads ophalen faalde: ${error.message}`, error);
  return { leads: (data ?? []) as Lead[], totaal: count ?? 0, pagina };
}

export async function tellers(db: SupabaseClient, nu = new Date()): Promise<Record<Tab, number>> {
  const uit = await Promise.all(
    TABS.map(async (t) => {
      const { count, error } = await filterTab(db.from('leads').select('*', { count: 'exact', head: true }), t, nu);
      if (error) fout(`tellen faalde: ${error.message}`, error);
      return [t, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(uit) as Record<Tab, number>;
}

export async function filterOpties(db: SupabaseClient): Promise<{ niches: string[]; plaatsen: string[] }> {
  const data = await leesAllePaginas(async (van, tot) => {
    const { data, error } = await db.from('leads').select('niche, plaats').order('id').range(van, tot);
    if (error) fout(`filters ophalen faalde: ${error.message}`, error);
    return (data ?? []) as { niche: string | null; plaats: string | null }[];
  });
  const niches = new Set<string>();
  const plaatsen = new Set<string>();
  for (const r of data) {
    if (r.niche) niches.add(r.niche);
    if (r.plaats) plaatsen.add(r.plaats);
  }
  return { niches: [...niches].sort(), plaatsen: [...plaatsen].sort() };
}

export async function haalLead(db: SupabaseClient, id: string): Promise<Lead> {
  const { data, error } = await db.from('leads').select('*').eq('id', id).maybeSingle();
  if (error) fout(`lead ophalen faalde: ${error.message}`, error);
  if (!data) throw new AppError('NOT_FOUND', { message: 'Deze lead bestaat niet (meer).' });
  return data as Lead;
}

export async function haalActiviteiten(db: SupabaseClient, leadId: string): Promise<(Activiteit & { door: string | null })[]> {
  const { data, error } = await db
    .from('lead_activiteiten')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) fout(`tijdlijn ophalen faalde: ${error.message}`, error);
  const rijen = (data ?? []) as Activiteit[];
  const ids = [...new Set(rijen.map((r) => r.user_id).filter((x): x is string => !!x))];
  const namen = await voornamen(db, ids);
  return rijen.map((r) => ({ ...r, door: r.user_id ? namen.get(r.user_id) ?? null : null }));
}

export async function voornamen(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const [{ data: afz }, { data: users }] = await Promise.all([
    db.from('lead_afzenders').select('user_id, voornaam').in('user_id', ids),
    db.from('users').select('id, email, full_name').in('id', ids),
  ]);
  const m = new Map<string, string>();
  for (const u of users ?? []) m.set(u.id, u.full_name || String(u.email).split('@')[0]);
  for (const a of afz ?? []) m.set(a.user_id, a.voornaam);
  return m;
}

// ── claim ────────────────────────────────────────────────────────────────

export async function claimVolgende(
  db: SupabaseClient,
  userId: string,
  focus: { niche?: string | null; plaats?: string | null },
): Promise<Lead | null> {
  const { data, error } = await db.rpc('leads_claim_volgende', {
    p_user: userId,
    p_niche: focus.niche || null,
    p_plaats: focus.plaats || null,
    p_minuten: CLAIM_MINUTEN,
  });
  if (error) fout(`volgende lead ophalen faalde: ${error.message}`, error);
  const rij = (data as Lead[] | null)?.[0];
  return rij ?? null;
}

/** Een specifieke lead claimen ("bel nu"). Null als een ander hem net heeft. */
export async function claimLead(db: SupabaseClient, userId: string, id: string, nu = new Date()): Promise<Lead | null> {
  const tot = new Date(nu.getTime() + CLAIM_MINUTEN * 60_000).toISOString();
  const { data, error } = await db
    .from('leads')
    .update({ geclaimd_door: userId, geclaimd_tot: tot })
    .eq('id', id)
    .or(`geclaimd_tot.is.null,geclaimd_tot.lt.${nu.toISOString()},geclaimd_door.eq.${userId}`)
    .select('*')
    .maybeSingle();
  if (error) fout(`lead claimen faalde: ${error.message}`, error);
  return (data as Lead | null) ?? null;
}

export async function verlengClaim(db: SupabaseClient, userId: string, id: string, nu = new Date()): Promise<boolean> {
  const tot = new Date(nu.getTime() + CLAIM_MINUTEN * 60_000).toISOString();
  const { data, error } = await db
    .from('leads')
    .update({ geclaimd_tot: tot })
    .eq('id', id)
    .eq('geclaimd_door', userId)
    .select('id');
  if (error) fout(`claim verlengen faalde: ${error.message}`, error);
  return (data ?? []).length > 0;
}

export async function geefVrij(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db
    .from('leads')
    .update({ geclaimd_door: null, geclaimd_tot: null })
    .eq('id', id)
    .eq('geclaimd_door', userId);
  if (error) fout(`claim vrijgeven faalde: ${error.message}`, error);
}

// ── schrijven ────────────────────────────────────────────────────────────

export const GEWIJZIGD_DOOR_ANDER = 'Deze lead is intussen door een ander gewijzigd. Herlaad en probeer opnieuw.';

/** Eén nullable kolom gelijk aan de gelezen waarde (null → `is null`, anders `eq`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function gelijkOfNull(q: any, kolom: string, waarde: string | null) {
  return waarde === null ? q.is(kolom, null) : q.eq(kolom, waarde);
}

/**
 * Nieuwe stand toepassen + activiteit loggen. Geeft de activiteit-id terug (voor ongedaan maken).
 *
 * De update is voorwaardelijk (optimistic concurrency): hij raakt de lead alleen als de stand nog
 * gelijk is aan wat `o.lead` las, én de lead niet door een ander geclaimd is (claim leeg, verlopen,
 * of van `userId` zelf). Anders INPUT_INVALID met GEWIJZIGD_DOOR_ANDER. Daardoor wist `vrijgeven`
 * ook alleen de eigen of een verlopen claim.
 *
 * Bekend en geaccepteerd: update en activiteit-insert lopen NIET in één transactie. Faalt de insert,
 * dan staat de nieuwe stand wel maar zonder activiteit (en dus zonder ongedaan-maken-knop).
 */
export async function pasStandToe(
  db: SupabaseClient,
  o: {
    lead: Lead;
    userId: string;
    nieuw: Stand;
    soort: ActiviteitSoort;
    uitkomst?: Uitkomst | null;
    details?: Record<string, unknown>;
    vrijgeven?: boolean;
    extraVelden?: Partial<Lead>;
    nu?: Date;
  },
): Promise<string> {
  // userId komt uit de sessie; toch eerst het formaat checken, want hij gaat een or()-string in.
  if (!isUuid(o.userId)) fout('ongeldige gebruiker');
  const nu = (o.nu ?? new Date()).toISOString();
  const patch: Record<string, unknown> = { ...o.nieuw, ...(o.extraVelden ?? {}) };
  if (o.vrijgeven) {
    patch.geclaimd_door = null;
    patch.geclaimd_tot = null;
  }
  let q = db
    .from('leads')
    .update(patch)
    .eq('id', o.lead.id)
    .eq('status', o.lead.status)
    .eq('pogingen_niet_opgenomen', o.lead.pogingen_niet_opgenomen);
  q = gelijkOfNull(q, 'laatste_poging_op', o.lead.laatste_poging_op);
  q = gelijkOfNull(q, 'opvolgmail_gestuurd_op', o.lead.opvolgmail_gestuurd_op);
  // Alleen sessie-userId (uuid-gecheckt) en een ISO-datum in deze or()-string.
  q = q.or(`geclaimd_door.is.null,geclaimd_tot.lt.${nu},geclaimd_door.eq.${o.userId}`);
  const { data: geraakt, error: upErr } = await q.select('id');
  if (upErr) fout(`lead bijwerken faalde: ${upErr.message}`, upErr);
  if ((geraakt ?? []).length !== 1) throw new AppError('INPUT_INVALID', { message: GEWIJZIGD_DOOR_ANDER });
  const { data, error } = await db
    .from('lead_activiteiten')
    .insert({
      lead_id: o.lead.id,
      user_id: o.userId,
      soort: o.soort,
      uitkomst: o.uitkomst ?? null,
      details: o.details ?? {},
      vorige_staat: pakStand(o.lead),
    })
    .select('id')
    .single();
  if (error) fout(`activiteit loggen faalde: ${error.message}`, error);
  return data.id as string;
}

export async function logActiviteit(
  db: SupabaseClient,
  o: { leadId: string; userId: string; soort: ActiviteitSoort; details?: Record<string, unknown> },
): Promise<string> {
  const { data, error } = await db
    .from('lead_activiteiten')
    .insert({ lead_id: o.leadId, user_id: o.userId, soort: o.soort, details: o.details ?? {} })
    .select('id')
    .single();
  if (error) fout(`activiteit loggen faalde: ${error.message}`, error);
  return data.id as string;
}

/**
 * Losse 'kennismaking'-activiteit bij een belpoging. `details.bij_activiteit` wijst naar die
 * belpoging, zodat maakOngedaan ze samen terugdraait (en de kennismaking niet als "later" telt).
 */
export async function logKennismaking(
  db: SupabaseClient,
  o: { leadId: string; userId: string; op: string | null; bijActiviteit: string },
): Promise<string> {
  return logActiviteit(db, {
    leadId: o.leadId,
    userId: o.userId,
    soort: 'kennismaking',
    details: { op: o.op, bij_activiteit: o.bijActiviteit },
  });
}

export const ONGEDAAN_VENSTER_MS = 15 * 60_000;

/** Zet de lead terug naar `vorige_staat` van de LAATSTE niet-ongedane activiteit. */
export async function maakOngedaan(db: SupabaseClient, activiteitId: string, nu = new Date()): Promise<string> {
  const { data: act, error } = await db.from('lead_activiteiten').select('*').eq('id', activiteitId).maybeSingle();
  if (error) fout(`activiteit ophalen faalde: ${error.message}`, error);
  if (!act) throw new AppError('NOT_FOUND', { message: 'Deze actie bestaat niet.' });
  const a = act as Activiteit;
  if (a.ongedaan_op) throw new AppError('INPUT_INVALID', { message: 'Deze actie is al ongedaan gemaakt.' });
  if (!a.vorige_staat) throw new AppError('INPUT_INVALID', { message: 'Deze actie kan niet ongedaan worden gemaakt.' });
  if (nu.getTime() - new Date(a.created_at).getTime() > ONGEDAAN_VENSTER_MS)
    throw new AppError('INPUT_INVALID', { message: 'Te lang geleden om ongedaan te maken.' });
  // Is er daarna nog iets gebeurd? Activiteiten die bij déze actie horen (bij_activiteit) tellen niet.
  // a.id komt uit de database (uuid), dus veilig in de or()-string.
  const { data: later, error: le } = await db
    .from('lead_activiteiten')
    .select('id')
    .eq('lead_id', a.lead_id)
    .is('ongedaan_op', null)
    .gt('created_at', a.created_at)
    .or(`details->>bij_activiteit.is.null,details->>bij_activiteit.neq.${a.id}`)
    .limit(1);
  if (le) fout(`latere acties ophalen faalde: ${le.message}`, le);
  if ((later ?? []).length) throw new AppError('INPUT_INVALID', { message: 'Er is daarna al iets anders met deze lead gebeurd.' });
  const { error: e1 } = await db.from('leads').update(a.vorige_staat).eq('id', a.lead_id);
  if (e1) fout(`terugzetten faalde: ${e1.message}`, e1);
  const { error: e2 } = await db.from('lead_activiteiten').update({ ongedaan_op: nu.toISOString() }).eq('id', a.id);
  if (e2) fout(`markeren als ongedaan faalde: ${e2.message}`, e2);
  // De activiteiten die bij deze actie hoorden (bv. de kennismaking) ook ongedaan maken.
  const { error: e3 } = await db
    .from('lead_activiteiten')
    .update({ ongedaan_op: nu.toISOString() })
    .eq('lead_id', a.lead_id)
    .eq('details->>bij_activiteit', a.id)
    .is('ongedaan_op', null);
  if (e3) fout(`bijbehorende acties markeren faalde: ${e3.message}`, e3);
  return a.lead_id;
}

export async function werkVeldenBij(db: SupabaseClient, id: string, patch: Partial<Pick<Lead, BewerkbaarVeld>>): Promise<Lead> {
  const { data, error } = await db.from('leads').update(patch).eq('id', id).select('*').single();
  if (error) {
    if (error.code === '23505') throw new AppError('INPUT_INVALID', { message: 'Er bestaat al een lead met dit domein of telefoonnummer.' });
    fout(`opslaan faalde: ${error.message}`, error);
  }
  return data as Lead;
}

export async function zoekDubbel(db: SupabaseClient, domein: string | null, telefoon: string | null): Promise<Lead | null> {
  const delen = [domein ? `domein.eq.${domein}` : null, telefoon ? `telefoon.eq.${telefoon}` : null].filter(Boolean);
  if (!delen.length) return null;
  const { data, error } = await db.from('leads').select('*').or(delen.join(',')).limit(1);
  if (error) fout(`dubbelcheck faalde: ${error.message}`, error);
  return ((data ?? [])[0] as Lead | undefined) ?? null;
}

export async function maakLead(
  db: SupabaseClient,
  userId: string,
  l: { bedrijfsnaam: string; domein: string | null; website_url: string | null; telefoon: string | null; niche: string | null; plaats: string | null },
): Promise<Lead> {
  const { data, error } = await db
    .from('leads')
    .insert({ ...l, bron: 'handmatig', aangemaakt_door: userId, score_voorlopig: false })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new AppError('INPUT_INVALID', { message: 'Er bestaat al een lead met dit domein of telefoonnummer.' });
    fout(`lead aanmaken faalde: ${error.message}`, error);
  }
  return data as Lead;
}

export async function zetStatusVoorVeel(
  db: SupabaseClient,
  userId: string,
  ids: string[],
  naar: LeadStatus,
  reden: string | null,
): Promise<number> {
  const { data: leads, error } = await db.from('leads').select('*').in('id', ids);
  if (error) fout(`leads ophalen faalde: ${error.message}`, error);
  let aantal = 0;
  for (const l of (leads ?? []) as Lead[]) {
    try {
      await pasStandToe(db, {
        lead: l,
        userId,
        nieuw: { ...pakStand(l), status: naar, status_reden: reden, volgende_actie_op: null, volgende_actie_notitie: null },
        soort: 'status',
        details: { van: l.status, naar, reden, bulk: true },
        vrijgeven: true,
      });
      aantal++;
    } catch (e) {
      // Een lead die een ander nu belt of net wijzigde slaan we over; de rest gaat door.
      if (e instanceof AppError && e.code === 'INPUT_INVALID') continue;
      throw e;
    }
  }
  return aantal;
}

// ── afzender ─────────────────────────────────────────────────────────────

export async function haalAfzender(db: SupabaseClient, userId: string): Promise<Afzender | null> {
  const { data, error } = await db.from('lead_afzenders').select('*').eq('user_id', userId).maybeSingle();
  if (error) fout(`afzender ophalen faalde: ${error.message}`, error);
  if (!data) return null;
  return {
    naam: data.naam,
    voornaam: data.voornaam,
    functie: data.functie,
    telefoon: data.telefoon,
    email: data.email,
    fotoUrl: data.foto_url,
  };
}

/** Naam in de kopbalk: voornaam uit het afzenderprofiel, anders het voorvoegsel van het e-mailadres. */
export async function naamVoorKop(db: SupabaseClient, userId: string, email: string | null): Promise<string> {
  const { data, error } = await db.from('lead_afzenders').select('voornaam').eq('user_id', userId).maybeSingle();
  if (error) console.error('[leads] voornaam ophalen faalde:', error.message);
  const voornaam = typeof data?.voornaam === 'string' ? data.voornaam.trim() : '';
  return voornaam || (email ? email.split('@')[0] : 'Ingelogd');
}

export async function bewaarAfzender(db: SupabaseClient, userId: string, a: Afzender): Promise<void> {
  const { error } = await db.from('lead_afzenders').upsert({
    user_id: userId,
    naam: a.naam,
    voornaam: a.voornaam,
    functie: a.functie,
    telefoon: a.telefoon,
    email: a.email,
    foto_url: a.fotoUrl,
  });
  if (error) fout(`afzender opslaan faalde: ${error.message}`, error);
}

// ── vandaag-teller voor de belmodus ──────────────────────────────────────

export async function tellerVandaag(db: SupabaseClient, userId: string, sinds: Date) {
  const { data, error } = await db
    .from('lead_activiteiten')
    .select('uitkomst')
    .eq('user_id', userId)
    .eq('soort', 'belpoging')
    .is('ongedaan_op', null)
    .gte('created_at', sinds.toISOString());
  if (error) fout(`teller ophalen faalde: ${error.message}`, error);
  const rijen = data ?? [];
  return {
    gebeld: rijen.length,
    opgenomen: rijen.filter((r) => r.uitkomst !== 'niet_opgenomen').length,
    interesse: rijen.filter((r) => r.uitkomst === 'interesse').length,
  };
}

// ── AVG-opschoning, hooguit 1x per dag per instance ──────────────────────

let laatsteOpschoning = 0;
export async function misschienOpschonen(db: SupabaseClient, nu = Date.now()): Promise<void> {
  if (nu - laatsteOpschoning < 24 * 3600_000) return;
  laatsteOpschoning = nu;
  const { error } = await db.rpc('leads_opschonen');
  if (error) console.error('[leads] opschonen faalde:', error.message);
}
