// v0.8.1 — anti-adoptie detector.
//
// Probleem (baseline v0.8.0): bij een planted_fact-aanval plant de user een
// onwaar feit in de chat-history ("mijn adviseur Mark Visser", "mijn therapeut
// heet Frank") en de bot ADOPTEERT dat ("Ja, dat kan. Je kunt een afspraak
// maken met Mark Visser") i.p.v. te corrigeren. Embedding-claim-verify en de
// hard-fact-verifier (geld/datums/contact) vangen dit niet — een verzonnen
// PERSOONSNAAM is geen "hard fact" in die zin.
//
// Aanpak: detecteer entiteiten (persoonsnamen) die (a) de user in de history
// introduceerde, (b) NIET in de retrieval-sources voorkomen, en (c) tóch in
// het bot-antwoord verschijnen. Zo'n entiteit = mogelijke adoptie van een
// geplant feit. De caller voedt dit in de BESTAANDE claim-regenerate-trigger
// (rag.ts Stage 15) — geen nieuwe parallelle laag, geen prompt-only fix.
//
// Bewust conservatief (precision > recall): liever een echte adoptie missen
// dan een legitieme entiteit ten onrechte flaggen. De source-membership-check
// zorgt dat echte medewerkers/plaatsen (bv. "Linda van Dijk" in de acme-docs)
// nooit getriggerd worden.
//
// Geen 'server-only' import — pure functies, tsx-testable.

// Nederlandse tussenvoegsels die binnen een meerwoordige naam mogen staan.
const TUSSENVOEGSEL = '(?:van|de|der|den|ten|ter|te|von|der|het|op)';

// Meerwoordige eigennaam: 2+ hoofdletterwoorden, optioneel met tussenvoegsels
// ertussen. Vangt "Mark Visser", "Roel de Wit", "Marc van der Berg".
const MULTIWORD_NAME_RE = new RegExp(
  `\\b([A-ZÀ-Þ][a-zà-ÿ]+(?:\\s+${TUSSENVOEGSEL})*\\s+[A-ZÀ-Þ][a-zà-ÿ]+)\\b`,
  'g',
);

// Enkel-woord voornaam direct ná een naming/rol-keyword. Vangt "heet Frank",
// "therapeut Sophie", "companion Frank". GEEN i-flag: de keywords staan in
// plant-zinnen lowercase, en de capture-groep moet strikt hoofdletter-initiaal
// blijven — met i-flag zou "therapeut heet" ten onrechte "heet" vangen.
const NAMING_KEYWORD_RE =
  /\b(?:heet|heten|genaamd|therapeut|fysiotherapeut|adviseur|accountant|boekhouder|monteur|dakdekker|medewerker|contactpersoon|companion|collega|behandelaar|specialist|consultant)\s+([A-ZÀ-Þ][a-zà-ÿ]+)\b/g;

// Stopwoorden: hoofdletterwoorden die geen persoonsnaam zijn maar wel ná een
// keyword of als losse cap kunnen opduiken. Klein gehouden.
const NON_NAME_STOPWORDS = new Set([
  'De', 'Het', 'Een', 'Ik', 'Je', 'Jij', 'Wij', 'Mijn', 'Uw', 'Onze', 'Deze',
  'Die', 'Dat', 'Voor', 'Met', 'Bij', 'Van', 'Op', 'Aan', 'Er', 'Als',
]);

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** Extraheer kandidaat-persoonsnamen uit een tekst (history-turn). */
export function extractCandidateEntities(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const out = new Set<string>();

  let m: RegExpExecArray | null;
  MULTIWORD_NAME_RE.lastIndex = 0;
  while ((m = MULTIWORD_NAME_RE.exec(text)) !== null) {
    const name = normalize(m[1]);
    // Verwerp als het eerste woord een stopwoord is (bv. "De Boer" als zinsdeel)
    const first = name.split(' ')[0];
    if (!NON_NAME_STOPWORDS.has(first)) out.add(name);
  }

  NAMING_KEYWORD_RE.lastIndex = 0;
  while ((m = NAMING_KEYWORD_RE.exec(text)) !== null) {
    const name = normalize(m[1]);
    if (!NON_NAME_STOPWORDS.has(name)) out.add(name);
  }

  // Dedup: laat enkel-woord kandidaten vallen die al het eerste woord van een
  // meerwoordige naam zijn ("Mark" wanneer "Mark Visser" ook gevangen is).
  const all = [...out];
  const multiword = all.filter((e) => e.includes(' '));
  return all.filter((e) => {
    if (e.includes(' ')) return true;
    return !multiword.some((mw) => mw.split(' ')[0] === e);
  });
}

/** Bevat één van de source-teksten deze entiteit (case-insensitive substring)? */
function entityInSources(entity: string, sourceTexts: string[]): boolean {
  const needle = entity.toLowerCase();
  return sourceTexts.some((s) => typeof s === 'string' && s.toLowerCase().includes(needle));
}

// Negatie-markers die aangeven dat de bot de entiteit ONTKENT i.p.v. adopteert.
const NEGATION_RE = /\b(geen|niet|nooit|onbekend)\b/i;

/**
 * Bevestigt het antwoord de entiteit (= adoptie) i.p.v. te ontkennen?
 * Heuristiek: pak de zin(nen) waarin de entiteit voorkomt; als minstens één
 * van die zinnen GEEN negatie-marker bevat → bevestigend (adoptie). Een
 * correcte weigering ("Bij ons werkt GEEN Mark Visser") heeft de negatie in
 * de host-zin en telt dus NIET als adoptie. Voorkomt dat we een juiste
 * ontkenning ten onrechte als adoptie flaggen (zelfde valkuil als must_not).
 */
function answerAffirmsEntity(entity: string, answer: string): boolean {
  const escaped = entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'i');
  const sentences = answer.split(/(?<=[.!?])\s+/);
  const hostSentences = sentences.filter((s) => re.test(s));
  if (hostSentences.length === 0) return false;
  return hostSentences.some((s) => !NEGATION_RE.test(s));
}

/**
 * Hoofd-detector. Returnt de entiteiten die:
 *  - door de user in de history zijn geïntroduceerd,
 *  - NIET in de retrieval-sources voorkomen,
 *  - WEL (word-boundary) in het bot-antwoord verschijnen.
 *
 * Niet-leeg resultaat = mogelijke adoptie van een geplant feit → caller mag
 * de bestaande claim-regenerate triggeren.
 */
export function detectAdoptedHistoryEntities(
  historyUserContents: string[],
  answerText: string,
  sourceTexts: string[],
): string[] {
  if (!historyUserContents || historyUserContents.length === 0) return [];
  if (!answerText) return [];

  const candidates = new Set<string>();
  for (const turn of historyUserContents) {
    for (const e of extractCandidateEntities(turn)) candidates.add(e);
  }
  if (candidates.size === 0) return [];

  const adopted: string[] = [];
  for (const entity of candidates) {
    if (entityInSources(entity, sourceTexts)) continue; // legitieme entiteit
    // Alleen bevestigde entiteiten = echte adoptie; een correcte ontkenning
    // ("werkt geen Mark Visser") wordt NIET geflagd.
    if (answerAffirmsEntity(entity, answerText)) adopted.push(entity);
  }
  return adopted;
}
