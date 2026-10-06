// v0.13 (launch-onderzoek): deterministische premisse-check. Haalt uit de vraag
// (en eerdere gebruikersbeurten) persoonsnamen, bedragen, percentages en
// telefoonnummers, en meldt welke NIET in de CONTEXT voorkomen. Die lijst gaat
// als korte CONTROLE-regel ná de vraag in de user-turn (recency wint; zie de
// taal-directive). Doel: Luna zet een geplante premisse stellig recht en neemt
// hem niet over in de vervolgstap ("vraag of Jan tijd heeft").
// Pure functies — geen 'server-only', tsx-testbaar.
import { extractHardFacts } from './hard-facts';

const PARTICLES = '(?:de|van|der|den|ter|ten|het|la|le)';
// Twee+ hoofdletterwoorden (evt. met tussenvoegsels): "Jan de Vries", "Mark Visser".
const FULL_NAME_RE = new RegExp(
  `\\b([A-Z][a-zà-ÿ]+(?:\\s+(?:${PARTICLES}\\s+)*[A-Z][a-zà-ÿ]+)+)\\b`,
  'g',
);
// Rol + voornaam: "therapeut Frank", "monteur Jan", "bij Kevin".
const ROLE_NAME_RE =
  /\b(?:monteur|therapeut|fysiotherapeut|fysio|adviseur|medewerker|medewerkster|meneer|mevrouw|collega|instructeur|instructrice|dakdekker|accountant|specialist|eigenaar|oprichter|behandelaar|leidinggevende|bij|met)\s+([A-Z][a-zà-ÿ]{2,})\b/g;

const STOP = new Set([
  'Ik', 'Je', 'Jij', 'U', 'Wij', 'We', 'Hij', 'Zij', 'Het', 'De', 'Een', 'Dit', 'Dat', 'Deze', 'Die', 'Wat', 'Wie', 'Waar', 'Wanneer', 'Hoe', 'Hoeveel', 'Welke', 'Kan', 'Kunnen', 'Mag', 'Is', 'Zijn', 'Heeft', 'Hebben', 'Graag', 'Hallo', 'Hoi', 'Beste', 'Goedemorgen', 'Goedemiddag', 'Bedankt', 'Dank', 'Oké', 'Ok', 'Ja', 'Nee',
  'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag',
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
  'Google', 'Facebook', 'Instagram', 'WhatsApp', 'iDEAL', 'CBR', 'KvK', 'BTW',
]);

function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

export function extractPremiseCandidates(texts: string[]): { names: string[]; facts: string[] } {
  const names = new Set<string>();
  const facts = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(FULL_NAME_RE)) {
      const words = m[1].split(/\s+/);
      // Aan zinsbegin is het eerste hoofdletterwoord meestal een werkwoord of
      // lidwoord ("Valt Lelystad…", "Heeft Jan de Vries…") — laat het vallen.
      const before = t.slice(0, m.index ?? 0);
      if (/(^|[.!?:\n])\s*$/.test(before)) words.shift();
      while (words.length && STOP.has(words[0])) words.shift();
      const caps = words.filter((w) => /^[A-Z]/.test(w));
      if (caps.length >= 2) names.add(words.join(' '));
    }
    for (const m of t.matchAll(ROLE_NAME_RE)) {
      if (!STOP.has(m[1])) names.add(m[1]);
    }
    const f = extractHardFacts(t);
    for (const v of f.money) facts.add(`€ ${v}`);
    for (const v of f.percentages) facts.add(`${v}%`);
    for (const v of f.phones) facts.add(v);
  }
  // Een losse voornaam die al deel is van een volledige naam niet dubbel melden.
  const full = [...names].filter((n) => n.includes(' '));
  const out = [...names].filter((n) => n.includes(' ') || !full.some((f) => f.split(/\s+/).includes(n)));
  return { names: out, facts: [...facts] };
}

/** Welke kandidaten komen NIET in de context voor? Namen: elk naamwoord (geen
 *  tussenvoegsel) moet als woord in de context staan. Feiten: genormaliseerd via
 *  extractHardFacts van de context. `exclude` = namen die altijd ok zijn (bv.
 *  bedrijfsnaam). */
export function findUnsupportedPremises(
  questionTexts: string[],
  contextText: string,
  exclude: string[] = [],
): string[] {
  const { names, facts } = extractPremiseCandidates(questionTexts);
  const ctx = ` ${norm(contextText).replace(/[^a-z0-9à-ÿ ]+/g, ' ')} `;
  const ex = exclude.map(norm);
  const missing: string[] = [];
  for (const n of names) {
    const nn = norm(n);
    if (ex.some((e) => e.includes(nn) || nn.includes(e))) continue;
    const parts = nn.split(' ').filter((w) => !new RegExp(`^${PARTICLES}$`).test(w));
    if (!parts.every((w) => ctx.includes(` ${w} `))) missing.push(n);
  }
  const cf = extractHardFacts(contextText);
  const ctxMoney = new Set([...cf.money, ...cf.numbers]);
  const ctxPct = new Set([...cf.percentages, ...cf.numbers]);
  const ctxPhone = new Set(cf.phones);
  for (const f of facts) {
    if (f.startsWith('€ ')) { if (!ctxMoney.has(f.slice(2))) missing.push(f); }
    else if (f.endsWith('%')) { if (!ctxPct.has(f.slice(0, -1))) missing.push(f); }
    else if (!ctxPhone.has(f)) missing.push(f);
  }
  return missing;
}

export function premiseCheckDirective(missing: string[]): string {
  if (missing.length === 0) return '';
  const list = missing.slice(0, 5).map((m) => `"${m}"`).join(', ');
  return `\n\nCONTROLE (automatisch): ${list} uit het bericht van de klant ${missing.length === 1 ? 'komt' : 'komen'} niet voor in de CONTEXT. Behandel dit als onbevestigd: neem het niet over, ook niet in je vervolgstap. Bevat de CONTEXT een overzicht waarin het had moeten staan (team, tarieven, contactgegevens), zeg dan stellig dat het niet klopt en geef het juiste gegeven; anders zeg je kort dat je het niet kunt bevestigen en verwijs je naar contact.`;
}

const RAW_PHONE_RE = /(?<![\d+])(\+31\s?(?:\(0\))?\s?\d(?:[\s-]?\d){7,9}|0\d(?:[\s-]?\d){7,9})\b/;
const RAW_EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;

/** v0.13 — vervanger voor het history-entiteit-weigertemplate: geen meta-zin
 *  ("onze gegevens", "eerder bericht"), toon-bewust (je/u), met het eerste
 *  telefoonnummer/e-mailadres uit de context als vervolgstap. */
export function historyEntityRefusal(args: {
  entities: string[];
  company: string;
  contextText: string;
  formal: boolean;
}): string {
  const list = args.entities.slice(0, 3).join(', ');
  const phone = args.contextText.match(RAW_PHONE_RE)?.[0]?.trim();
  const email = args.contextText.match(RAW_EMAIL_RE)?.[0]?.replace(/[.,;:]+$/, '');
  const contact = phone && email ? `${phone} of ${email}` : phone ?? email ?? null;
  const you = args.formal ? 'u' : 'je';
  const can = args.formal ? 'kunt u' : 'kun je';
  const tail = contact
    ? `Voor de juiste contactpersoon of een afspraak ${can} ons bereiken via ${contact}.`
    : `Voor de juiste contactpersoon of een afspraak ${can} het beste even contact met ons opnemen.`;
  void you;
  return `${list} kan ik niet bevestigen als medewerker of afspraak van ${args.company}, dus dat neem ik niet over. ${tail}`.replace(/\s+/g, ' ');
}
