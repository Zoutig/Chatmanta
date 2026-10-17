'use server';

// Server actions van het leads-dashboard. Auth: requireJorionAdmin() per action
// (de layout beschermt geen actions). DB: service-role (admin-only tabellen,
// RLS aan zonder policies, migr 0032).

import { revalidatePath } from 'next/cache';
import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { isAppError, AppError } from '@/lib/errors/app-error';
import { actionTry, type ActionResult, type ActionFail } from '@/lib/errors/action';
import {
  BEWERKBARE_VELDEN,
  BEZWAREN,
  NIET_BELLEN_REDENEN,
  OPVOLG_SITUATIES,
  pakStand,
  type Afzender,
  type BewerkbaarVeld,
  type Lead,
  type OpvolgSituatie,
  type Activiteit,
} from '@/lib/leads/types';
import { volgendeStand, naMailVerstuurd, handmatigeStatus, type UitkomstOpties, type HandmatigeStatus } from '@/lib/leads/volgende-stand';
import { normaliseerDomein, normaliseerTelefoon, schoneWebsiteUrl, schoonEmail } from '@/lib/leads/normaliseren';
import { beginVanDag } from '@/lib/leads/werkdagen';
import * as dbl from '@/lib/leads/server/db';

type Ctx = { userId: string; db: ReturnType<typeof getV1ServiceRoleClient> };

async function ctx(): Promise<Ctx | ActionFail> {
  try {
    const user = await requireJorionAdmin();
    return { userId: user.id, db: getV1ServiceRoleClient() };
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message, code: e.code };
    throw e;
  }
}
const isFail = (x: Ctx | ActionFail): x is ActionFail => 'ok' in x;
const ongeldig = (m: string): never => {
  throw new AppError('INPUT_INVALID', { message: m });
};
/** Lead-/activiteit-id's van de client: eerst uuid-formaat, dan pas een query. */
const uuid = (id: unknown): string => (dbl.isUuid(id) ? id : ongeldig('Ongeldig id.'));
const META = { surface: 'dashboard' as const, route: '/v1/leads' };

function revalidate(id?: string) {
  revalidatePath('/v1/leads', 'layout');
  if (id) revalidatePath(`/v1/leads/${id}`);
}

export type BelKaart = {
  lead: Lead;
  tijdlijn: (Activiteit & { door: string | null })[];
  teller: { gebeld: number; opgenomen: number; interesse: number };
};

async function kaart(c: Ctx, lead: Lead): Promise<BelKaart> {
  const [tijdlijn, teller] = await Promise.all([
    dbl.haalActiviteiten(c.db, lead.id),
    dbl.tellerVandaag(c.db, c.userId, beginVanDag(new Date())),
  ]);
  return { lead, tijdlijn, teller };
}

// ── belmodus ─────────────────────────────────────────────────────────────

export async function volgendeLeadAction(focus: { niche?: string | null; plaats?: string | null }): Promise<ActionResult<{ kaart: BelKaart | null }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const lead = await dbl.claimVolgende(c.db, c.userId, focus);
    return { kaart: lead ? await kaart(c, lead) : null };
  }, META);
}

export async function claimLeadAction(id: string): Promise<ActionResult<{ kaart: BelKaart | null }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    await dbl.haalLead(c.db, uuid(id)); // bestaat?
    const lead = await dbl.claimLead(c.db, c.userId, id);
    return { kaart: lead ? await kaart(c, lead) : null };
  }, META);
}

export async function verlengClaimAction(id: string): Promise<ActionResult<{ nogVanMij: boolean }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    await dbl.haalLead(c.db, uuid(id));
    return { nogVanMij: await dbl.verlengClaim(c.db, c.userId, id) };
  }, META);
}

export async function geefVrijAction(id: string): Promise<ActionResult> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    await dbl.haalLead(c.db, uuid(id));
    await dbl.geefVrij(c.db, c.userId, id);
    return {};
  }, META);
}

function valideerOpties(o: UitkomstOpties): UitkomstOpties {
  switch (o.uitkomst) {
    case 'niet_opgenomen':
      if (o.naDerde && o.naDerde !== 'mail' && o.naDerde !== 'archief') ongeldig('Ongeldige keuze.');
      return { uitkomst: o.uitkomst, voicemail: Boolean(o.voicemail), naDerde: o.naDerde };
    case 'terugbellen':
      return { uitkomst: o.uitkomst, op: String(o.op), notitie: o.notitie ? String(o.notitie).slice(0, 500) : null };
    case 'wil_mail':
      return { uitkomst: o.uitkomst };
    case 'interesse':
      return { uitkomst: o.uitkomst, mail: Boolean(o.mail), kennismakingOp: o.kennismakingOp ? String(o.kennismakingOp) : null };
    case 'geen_interesse':
      if (o.bezwaar && !(BEZWAREN as readonly string[]).includes(o.bezwaar)) ongeldig('Ongeldig bezwaar.');
      return { uitkomst: o.uitkomst, bezwaar: o.bezwaar ?? null, opnieuwOver3Maanden: Boolean(o.opnieuwOver3Maanden) };
    case 'niet_bellen':
      if (!(NIET_BELLEN_REDENEN as readonly string[]).includes(o.reden)) ongeldig('Ongeldige reden.');
      return { uitkomst: o.uitkomst, reden: o.reden };
    default:
      return ongeldig('Onbekende uitkomst.');
  }
}

export async function uitkomstAction(
  id: string,
  opties: UitkomstOpties,
): Promise<ActionResult<{ activiteitId: string; opentMail: OpvolgSituatie | null; lead: Lead }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const o = valideerOpties(opties);
    const lead = await dbl.haalLead(c.db, uuid(id));
    if (lead.geclaimd_door && lead.geclaimd_door !== c.userId && lead.geclaimd_tot && new Date(lead.geclaimd_tot) > new Date())
      ongeldig('Een ander is deze lead nu aan het bellen.');
    const nu = new Date();
    let overgang: ReturnType<typeof volgendeStand>;
    try {
      overgang = volgendeStand(pakStand(lead), o, nu);
    } catch (e) {
      // Regelfouten (datum in het verleden, keuze ontbreekt) zijn invoerfouten, geen serverfouten.
      return ongeldig(e instanceof Error ? e.message : 'Ongeldige invoer.');
    }
    const activiteitId = await dbl.pasStandToe(c.db, {
      lead,
      userId: c.userId,
      nieuw: overgang.stand,
      soort: 'belpoging',
      uitkomst: o.uitkomst,
      details: overgang.details,
      // Opent er een mail, dan blijft de claim staan tot de pop-up dicht is.
      vrijgeven: overgang.opentMail === null,
    });
    if (overgang.kennismaking) {
      await dbl.logKennismaking(c.db, {
        leadId: id,
        userId: c.userId,
        op: overgang.stand.kennismaking_op,
        bijActiviteit: activiteitId,
      });
    }
    revalidate(id);
    return { activiteitId, opentMail: overgang.opentMail, lead: { ...lead, ...overgang.stand } };
  }, META);
}

export async function overslaanAction(id: string): Promise<ActionResult> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    await dbl.haalLead(c.db, uuid(id));
    const over2uur = new Date(Date.now() + 2 * 3600_000).toISOString();
    const { error } = await c.db
      .from('leads')
      .update({ volgende_actie_op: over2uur, geclaimd_door: null, geclaimd_tot: null })
      .eq('id', id)
      .eq('geclaimd_door', c.userId);
    if (error) throw new AppError('INTERNAL', { message: `overslaan faalde: ${error.message}` });
    return {};
  }, META);
}

export async function ongedaanAction(activiteitId: string): Promise<ActionResult<{ kaart: BelKaart | null }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const leadId = await dbl.maakOngedaan(c.db, uuid(activiteitId));
    const lead = await dbl.claimLead(c.db, c.userId, leadId);
    revalidate(leadId);
    return { kaart: lead ? await kaart(c, lead) : null };
  }, META);
}

// ── velden, status, nieuw ────────────────────────────────────────────────

export async function werkVeldenBijAction(id: string, patch: Partial<Record<BewerkbaarVeld, string>>): Promise<ActionResult<{ lead: Lead }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const schoon: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!(BEWERKBARE_VELDEN as readonly string[]).includes(k)) ongeldig(`Veld ${k} mag niet.`);
      const w = typeof v === 'string' ? v.trim().slice(0, k === 'notitie' ? 4000 : 300) : '';
      if (k === 'aanspreekvorm') {
        if (w !== 'je' && w !== 'u') ongeldig('Kies je of u.');
        schoon[k] = w;
      } else if (k === 'telefoon') {
        const t = normaliseerTelefoon(w);
        if (w && !t) ongeldig('Dit telefoonnummer klopt niet.');
        schoon.telefoon = t;
      } else if (k === 'email') {
        const e = schoonEmail(w);
        if (w && !e) ongeldig('Dit e-mailadres klopt niet.');
        schoon.email = e;
      } else if (k === 'website_url') {
        const domein = normaliseerDomein(w);
        if (w && !domein) ongeldig('Deze website klopt niet.');
        schoon.website_url = domein ? schoneWebsiteUrl(w) : null;
        schoon.domein = domein;
      } else if (k === 'bedrijfsnaam') {
        if (!w) ongeldig('Bedrijfsnaam mag niet leeg zijn.');
        schoon[k] = w;
      } else schoon[k] = w || null;
    }
    const lead = await dbl.haalLead(c.db, uuid(id));
    // Website (domein) en telefoon zijn de sleutelvelden: minstens één moet blijven staan.
    const domeinNa = 'domein' in schoon ? schoon.domein : lead.domein;
    const telefoonNa = 'telefoon' in schoon ? schoon.telefoon : lead.telefoon;
    if (!domeinNa && !telefoonNa) ongeldig('Een lead heeft minstens een website of telefoonnummer nodig.');
    const nieuw = await dbl.werkVeldenBij(c.db, lead.id, schoon as Partial<Lead>);
    // Een gewijzigd e-mailadres komt ook in de lijst van gevonden adressen.
    if (typeof schoon.email === 'string' && !nieuw.emails_gevonden.includes(schoon.email)) {
      await c.db.from('leads').update({ emails_gevonden: [...nieuw.emails_gevonden, schoon.email] }).eq('id', id);
    }
    if ('notitie' in schoon && schoon.notitie && schoon.notitie !== lead.notitie) {
      await dbl.logActiviteit(c.db, { leadId: id, userId: c.userId, soort: 'notitie', details: { tekst: schoon.notitie } });
    }
    revalidate(id);
    return { lead: nieuw };
  }, META);
}

const HANDMATIG: HandmatigeStatus[] = ['open', 'archief', 'niet_bellen', 'klant', 'geen_interesse'];

export async function zetStatusAction(id: string, naar: HandmatigeStatus, reden: string | null = null): Promise<ActionResult<{ activiteitId: string }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    if (!HANDMATIG.includes(naar)) ongeldig('Ongeldige status.');
    const lead = await dbl.haalLead(c.db, uuid(id));
    const schoneReden = reden ? String(reden).slice(0, 200) : null;
    const activiteitId = await dbl.pasStandToe(c.db, {
      lead,
      userId: c.userId,
      nieuw: handmatigeStatus(pakStand(lead), naar, schoneReden),
      soort: 'status',
      details: { van: lead.status, naar, reden: schoneReden },
      vrijgeven: true,
    });
    revalidate(id);
    return { activiteitId };
  }, META);
}

export async function bulkArchiveerAction(ids: string[]): Promise<ActionResult<{ aantal: number }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) ongeldig('Kies 1 tot 200 leads.');
    const schoneIds = [...new Set(ids.map(uuid))];
    const aantal = await dbl.zetStatusVoorVeel(c.db, c.userId, schoneIds, 'archief', 'bulk');
    revalidate();
    return { aantal };
  }, META);
}

export async function nieuweLeadAction(invoer: {
  bedrijfsnaam: string;
  website: string;
  telefoon: string;
  niche: string;
  plaats: string;
}): Promise<ActionResult<{ id: string; bestond: boolean }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const naam = String(invoer.bedrijfsnaam ?? '').trim().slice(0, 200);
    if (!naam) ongeldig('Vul een bedrijfsnaam in.');
    const domein = normaliseerDomein(invoer.website);
    const telefoon = normaliseerTelefoon(invoer.telefoon);
    if (invoer.website?.trim() && !domein) ongeldig('Deze website klopt niet.');
    if (invoer.telefoon?.trim() && !telefoon) ongeldig('Dit telefoonnummer klopt niet.');
    if (!domein && !telefoon) ongeldig('Vul een website of telefoonnummer in.');
    const dubbel = await dbl.zoekDubbel(c.db, domein, telefoon);
    if (dubbel) return { id: dubbel.id, bestond: true };
    const lead = await dbl.maakLead(c.db, c.userId, {
      bedrijfsnaam: naam,
      domein,
      website_url: schoneWebsiteUrl(invoer.website),
      telefoon,
      niche: String(invoer.niche ?? '').trim() || null,
      plaats: String(invoer.plaats ?? '').trim() || null,
    });
    revalidate();
    return { id: lead.id, bestond: false };
  }, META);
}

// ── mail ─────────────────────────────────────────────────────────────────

export async function mailVerstuurdAction(
  id: string,
  m: { situatie: OpvolgSituatie; onderwerp: string; aan: string },
): Promise<ActionResult<{ activiteitId: string }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    if (!(OPVOLG_SITUATIES as readonly string[]).includes(m.situatie)) ongeldig('Ongeldige situatie.');
    const aan = schoonEmail(m.aan);
    if (!aan) return ongeldig('Dit e-mailadres klopt niet.');
    const lead = await dbl.haalLead(c.db, uuid(id));
    const activiteitId = await dbl.pasStandToe(c.db, {
      lead,
      userId: c.userId,
      nieuw: naMailVerstuurd(pakStand(lead), m.situatie, new Date()),
      soort: 'mail',
      details: { situatie: m.situatie, onderwerp: String(m.onderwerp).slice(0, 200), aan },
      vrijgeven: true,
      extraVelden: {
        email: aan,
        emails_gevonden: lead.emails_gevonden.includes(aan) ? lead.emails_gevonden : [...lead.emails_gevonden, aan],
      },
    });
    revalidate(id);
    return { activiteitId };
  }, META);
}

export async function bewaarAfzenderAction(a: Afzender): Promise<ActionResult> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const schoon: Afzender = {
      naam: String(a.naam ?? '').trim().slice(0, 100),
      voornaam: String(a.voornaam ?? '').trim().slice(0, 60),
      functie: String(a.functie ?? '').trim().slice(0, 60) || 'Oprichter',
      telefoon: String(a.telefoon ?? '').trim().slice(0, 30),
      email: schoonEmail(String(a.email ?? '').slice(0, 200)) ?? '',
      fotoUrl: a.fotoUrl ? String(a.fotoUrl).trim().slice(0, 300) : null,
    };
    if (!schoon.naam || !schoon.voornaam) ongeldig('Vul je naam en voornaam in.');
    if (!normaliseerTelefoon(schoon.telefoon)) ongeldig('Dit telefoonnummer klopt niet.');
    if (!schoon.email) ongeldig('Dit e-mailadres klopt niet.');
    if (schoon.fotoUrl && !/^https:\/\/\S+$/.test(schoon.fotoUrl)) ongeldig('De foto moet een https-link zijn.');
    await dbl.bewaarAfzender(c.db, c.userId, schoon);
    revalidate();
    return {};
  }, META);
}
