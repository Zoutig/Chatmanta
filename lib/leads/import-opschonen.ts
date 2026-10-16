// Import van Niels' ChatbotScanner-data → schone leads. Puur (geen fs, geen DB);
// het script scripts/leads-import.ts leest de bestanden en schrijft.
// Bewust: knock-outs "geen e-mail", "onbereikbaar" en "te weinig content" blijven
// staan (om te bellen is een telefoonnummer genoeg); ze krijgen hooguit een label.

import type { LeadStatus } from './types';
import { schoonEmail, normaliseerDomein, normaliseerTelefoon, schoneWebsiteUrl } from './normaliseren';

export type NielsLead = {
  url: string;
  bedrijfsnaam: string;
  niche: string | null;
  woorden: number | null;
  emails: string[];
  telefoons: string[];
  heeft_chatbot: boolean;
  chatbot_naam: string | null;
  platform: string | null;
  fout: string | null;
  google_score: number | null;
  google_reviews: number | null;
  plaats: string | null;
  provincie: string | null;
  score: number | null;
  max_score: number | null;
  knockout: string | null;
  redenen: string[];
};

export type NielsStatus = {
  mail_verstuurd?: string | null;
  gebeld?: string | null;
  reactie_ontvangen?: string | null;
  uitkomst?: string | null;
  notitie?: string | null;
  niet_benaderen?: boolean | null;
  heeft_chatbot?: boolean | null;
};

export type ImportLead = {
  domein: string | null;
  telefoon: string | null;
  bedrijfsnaam: string;
  website_url: string | null;
  niche: string | null;
  plaats: string | null;
  provincie: string | null;
  telefoons_extra: string[];
  email: string | null;
  emails_gevonden: string[];
  notitie: string | null;
  google_rating: number | null;
  google_reviews: number | null;
  heeft_chatbot: boolean | null;
  chatbot_naam: string | null;
  platform: string | null;
  woorden: number | null;
  score: number | null;
  score_max: number | null;
  score_redenen: string[];
  score_voorlopig: true;
  labels: string[];
  status: LeadStatus;
  status_reden: string | null;
  bron: 'import_niels';
  bron_data: { url: string; knockout: string | null; andere_domeinen?: string[] };
};

export type ImportActiviteit = { soort: 'import'; details: Record<string, unknown> };

export type ImportRapport = {
  gelezen: number;
  leads: number;
  adresgids: number;
  zonderSleutel: number;
  dubbelDomein: number;
  samengevoegdTelefoon: number;
  emailsAfgekeurd: number;
  metChatbot: number;
  labels: Record<string, number>;
  statusOvergenomen: number;
};

export const ADRESGIDSEN = new Set([
  'nlmappoint.org',
  'nlpathmap.org',
  'openingstijden.nl',
  'telefoonboek.nl',
  'detelefoongids.nl',
  'goudengids.nl',
  'werkspot.nl',
  'trustoo.nl',
  'homedeal.nl',
  'bouwbedrijven.nl',
]);

const NICHE_WOORDEN = ['dakdekker', 'hovenier', 'installateur', 'installatiebedrijf', 'schoonmaak', 'schoonmaakbedrijf', 'loodgieter', 'aannemer', 'tuinman'];

function isGeneriekeNaam(naam: string, plaats: string | null): boolean {
  const w = naam.toLowerCase().trim();
  const woorden = w.split(/\s+/);
  if (woorden.length > 4) return false;
  const heeftNiche = NICHE_WOORDEN.some((n) => w.includes(n));
  const heeftPlaats = plaats ? w.includes(plaats.toLowerCase()) : false;
  return heeftNiche && heeftPlaats;
}

function kiesEmail(geldig: string[], domein: string | null): string | null {
  if (!geldig.length) return null;
  const eigen = domein ? geldig.find((e) => e.toLowerCase().endsWith(`@${domein}`)) : undefined;
  return eigen ?? geldig[0];
}

function labelsVoor(n: NielsLead, url: string | null): string[] {
  const labels: string[] = [];
  if (url && /\/vestiging(en)?\//i.test(url)) labels.push('keten');
  if (isGeneriekeNaam(n.bedrijfsnaam, n.plaats)) labels.push('generieke_naam');
  const ko = (n.knockout ?? '').toLowerCase();
  if (n.fout || ko.includes('niet bereikbaar') || ko.includes('niet gescand')) labels.push('site_onbereikbaar');
  if (ko.includes('te weinig content')) labels.push('weinig_tekst');
  return labels;
}

function mapStatus(s: NielsStatus | undefined): { status?: LeadStatus; activiteit?: ImportActiviteit; notitie?: string } {
  if (!s) return {};
  const uitkomst = (s.uitkomst ?? 'geen').toLowerCase().replace(/[_-]/g, ' ').trim();
  let status: LeadStatus | undefined;
  if (s.niet_benaderen) status = 'niet_bellen';
  else if (s.heeft_chatbot) status = 'heeft_chatbot';
  else if (uitkomst === 'geen interesse') status = 'geen_interesse';
  else if (uitkomst === 'interesse' || uitkomst === 'demo gepland') status = 'kans';
  else if (uitkomst === 'klant') status = 'klant';
  else if (s.mail_verstuurd) status = 'opvolgen';
  const details: Record<string, unknown> = {};
  if (s.gebeld) details.gebeld = s.gebeld;
  if (s.mail_verstuurd) details.mail_verstuurd = s.mail_verstuurd;
  if (s.reactie_ontvangen) details.reactie_ontvangen = s.reactie_ontvangen;
  if (uitkomst !== 'geen') details.uitkomst = s.uitkomst;
  const activiteit = Object.keys(details).length ? { soort: 'import' as const, details } : undefined;
  return { status, activiteit, notitie: s.notitie?.trim() || undefined };
}

export function verwerkImport(
  ruw: NielsLead[],
  opties: { googleTelefoon?: Map<string, string>; status?: Record<string, NielsStatus> } = {},
): { leads: ImportLead[]; activiteiten: Map<string, ImportActiviteit[]>; rapport: ImportRapport } {
  const rapport: ImportRapport = {
    gelezen: ruw.length,
    leads: 0,
    adresgids: 0,
    zonderSleutel: 0,
    dubbelDomein: 0,
    samengevoegdTelefoon: 0,
    emailsAfgekeurd: 0,
    metChatbot: 0,
    labels: {},
    statusOvergenomen: 0,
  };

  // 1. per lead schoonmaken; dubbel domein: eerste wint
  const opDomein = new Map<string, ImportLead>();
  const zonderDomein: ImportLead[] = [];
  for (const n of ruw) {
    const domein = normaliseerDomein(n.url);
    if (domein && ADRESGIDSEN.has(domein)) {
      rapport.adresgids++;
      continue;
    }
    if (domein && opDomein.has(domein)) {
      rapport.dubbelDomein++;
      continue;
    }
    const telefoons = [
      ...(domein && opties.googleTelefoon?.get(domein) ? [opties.googleTelefoon.get(domein)!] : []),
      ...(n.telefoons ?? []),
    ]
      .map((t) => normaliseerTelefoon(t))
      .filter((t): t is string => t !== null)
      .filter((t, i, a) => a.indexOf(t) === i);
    const telefoon = telefoons[0] ?? null;
    if (!domein && !telefoon) {
      rapport.zonderSleutel++;
      continue;
    }
    const emails = n.emails ?? [];
    const geldig = emails
      .map((e) => schoonEmail(e))
      .filter((e): e is string => e !== null)
      .filter((e, i, a) => a.indexOf(e) === i);
    rapport.emailsAfgekeurd += emails.length - geldig.length;
    const website = schoneWebsiteUrl(n.url);
    const lead: ImportLead = {
      domein,
      telefoon,
      bedrijfsnaam: n.bedrijfsnaam?.trim() || domein || 'Onbekend',
      website_url: website,
      niche: n.niche || null,
      plaats: n.plaats || null,
      provincie: n.provincie || null,
      telefoons_extra: telefoons.slice(1, 4),
      email: kiesEmail(geldig, domein),
      emails_gevonden: geldig,
      notitie: null,
      google_rating: n.google_score ?? null,
      google_reviews: n.google_reviews ?? null,
      heeft_chatbot: n.heeft_chatbot ?? null,
      chatbot_naam: n.chatbot_naam ?? null,
      platform: n.platform ?? null,
      woorden: n.woorden ?? null,
      score: n.score ?? null,
      score_max: n.max_score ?? null,
      score_redenen: n.redenen ?? [],
      score_voorlopig: true,
      labels: labelsVoor(n, n.url),
      status: n.heeft_chatbot ? 'heeft_chatbot' : 'open',
      status_reden: null,
      bron: 'import_niels',
      bron_data: { url: n.url, knockout: n.knockout ?? null },
    };
    if (domein) opDomein.set(domein, lead);
    else zonderDomein.push(lead);
  }

  // 2. zelfde telefoonnummer op meerdere domeinen → één lead (meeste reviews)
  const opTelefoon = new Map<string, ImportLead>();
  const resultaat: ImportLead[] = [];
  for (const lead of [...opDomein.values(), ...zonderDomein]) {
    if (!lead.telefoon) {
      resultaat.push(lead);
      continue;
    }
    const bestaand = opTelefoon.get(lead.telefoon);
    if (!bestaand) {
      opTelefoon.set(lead.telefoon, lead);
      continue;
    }
    rapport.samengevoegdTelefoon++;
    const [winnaar, verliezer] =
      (lead.google_reviews ?? 0) > (bestaand.google_reviews ?? 0) ? [lead, bestaand] : [bestaand, lead];
    winnaar.bron_data.andere_domeinen = [
      ...(winnaar.bron_data.andere_domeinen ?? []),
      ...(verliezer.domein ? [verliezer.domein] : []),
      ...(verliezer.bron_data.andere_domeinen ?? []),
    ];
    opTelefoon.set(lead.telefoon, winnaar);
  }
  resultaat.push(...opTelefoon.values());

  // 3. status.json
  const activiteiten = new Map<string, ImportActiviteit[]>();
  for (const lead of resultaat) {
    const s = lead.domein ? opties.status?.[lead.domein] : undefined;
    const m = mapStatus(s);
    if (m.status) {
      lead.status = m.status;
      rapport.statusOvergenomen++;
    }
    if (m.notitie) lead.notitie = m.notitie;
    if (m.activiteit && lead.domein) activiteiten.set(lead.domein, [m.activiteit]);
    if (lead.status === 'heeft_chatbot') rapport.metChatbot++;
    for (const l of lead.labels) rapport.labels[l] = (rapport.labels[l] ?? 0) + 1;
  }

  // stabiele volgorde: zoals in de bron
  const volgorde = new Map(ruw.map((n, i) => [normaliseerDomein(n.url) ?? `#${i}`, i]));
  resultaat.sort((a, b) => (volgorde.get(a.domein ?? '') ?? 0) - (volgorde.get(b.domein ?? '') ?? 0));
  rapport.leads = resultaat.length;
  return { leads: resultaat, activiteiten, rapport };
}

/** Kleine CSV-lezer (komma, aanhalingstekens, kopregel). Genoeg voor Niels' CSV's. */
export function leesCsv(tekst: string): Record<string, string>[] {
  const regels: string[][] = [];
  let veld = '';
  let regel: string[] = [];
  let quote = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (quote) {
      if (c === '"' && tekst[i + 1] === '"') {
        veld += '"';
        i++;
      } else if (c === '"') quote = false;
      else veld += c;
    } else if (c === '"') quote = true;
    else if (c === ',') {
      regel.push(veld);
      veld = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && tekst[i + 1] === '\n') i++;
      regel.push(veld);
      veld = '';
      if (regel.some((x) => x !== '')) regels.push(regel);
      regel = [];
    } else veld += c;
  }
  if (veld !== '' || regel.length) {
    regel.push(veld);
    if (regel.some((x) => x !== '')) regels.push(regel);
  }
  const [kop, ...rest] = regels;
  if (!kop) return [];
  return rest.map((r) => Object.fromEntries(kop.map((k, i) => [k.trim(), (r[i] ?? '').trim()])));
}
