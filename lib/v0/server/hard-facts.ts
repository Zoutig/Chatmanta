// V0.6.1 hard-fact verifier — regex-extractie van harde feiten uit een
// antwoord, plus check of die feiten in de aangeleverde chunks staan.
//
// Probleem dat dit oplost: embedding-similarity (zie claims.ts) matcht op
// vector-shape, niet op exacte waarde. "€50 per maand" en "€500 per maand"
// hebben bijna identieke cosine-sim — een hallucinatie van het bedrag wordt
// niet door claim-verification gevangen. Voor een MKB-klantcontactbot is
// precies de prijzen/datums/aantallen-categorie waar hallucinatie het meest
// schadelijk is.
//
// Aanpak: regex per fact-type (money/percentage/date/number/email/url/phone),
// normaliseer naar canonical form (cijfers-only voor money/phone, lowercase
// voor email/url etc.), match als set-membership tegen genormaliseerde facts
// uit de source-texts.
//
// Bewust simpel: 80% van real-world cases dekken, 20% accepteren. Geen
// natural-language number parsing ("vijftig euro"), geen full date parsing
// (alleen DD-MM-YYYY / YYYY formats), geen i18n (NL-focus, EUR/euro).
//
// Geen 'server-only' import — pure functions, tsx-testable.

export type ExtractedHardFacts = {
  /** Geld-bedragen in canonical form (cijfers + decimal). Bv "€50" → "50". */
  money: string[];
  /** Percentages in canonical form. Bv "5,5%" → "5.5". */
  percentages: string[];
  /** Datums (DD-MM-YYYY/DD/MM/YYYY) of losse jaren (1900-2099). */
  datesOrYears: string[];
  /** Andere getallen ≥2 cijfers (nadat money/dates/% gestript zijn). */
  numbers: string[];
  /** E-mailadressen (lowercase). */
  emails: string[];
  /** URL's (lowercase host, geen trailing slash). */
  urls: string[];
  /** Nederlandse telefoonnummers (cijfers-only). */
  phones: string[];
};

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

// €50 / € 50 / €50,00 / €50.00 / EUR 50 / EUR50 / 50 euro / 50,00 euro
const MONEY_RE =
  /(?:€\s?|\bEUR\s?)(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\b|\b(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s?(?:euro|EUR)\b/gi;

// 5% / 5,5% / 5.5 % / 100%
const PERCENT_RE = /\b(\d+(?:[.,]\d+)?)\s?%/g;

// 15-3-2024, 15/03/2024, 15.3.24 + losse jaren 1900-2099
const DATE_RE =
  /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b|\b((?:19|20)\d{2})\b/g;

// Generic ≥2-cijfer nummers (gerunt NA money/percent/date strip)
const NUMBER_RE = /\b(\d{2,})\b/g;

// Email — vereenvoudigd RFC 5322. Lowercased bij extractie.
const EMAIL_RE = /\b([\w.+-]+@[\w-]+\.[\w.-]+)\b/gi;

// URL — http(s) of www. Strip trailing punctuation/slash bij normalisatie.
const URL_RE = /\b(https?:\/\/[^\s)<>]+|www\.[^\s)<>]+)/gi;

// NL telefoonnummer — +31 of 06 of 010 etc., min 10 cijfers totaal incl.
// optionele spaties/dashes. Wat conservatiever om false-positives te beperken
// (vermijdt match op IBANs / lange artikelnummers).
//
// Geen leading `\b` omdat `+` geen word-char is: `\b` tussen spatie en `+`
// is geen boundary. We gebruiken een negative lookbehind die voorkomt dat
// "X+31..." (cijfer/+ direct ervoor) matcht; whitespace, regel-begin, of
// leestekens zijn allemaal OK.
const PHONE_RE =
  /(?<![\d+])(\+31\s?(?:\(0\))?\s?\d(?:[\s-]?\d){7,9}|0\d(?:[\s-]?\d){7,9})\b/g;

// ---------------------------------------------------------------------------
// Normalisatie helpers
// ---------------------------------------------------------------------------

/** "50,00" / "50.00" / "1.234,56" / "1,234.56" → "50" / "50" / "1234.56" / "1234.56".
 *  Heuristiek: laatste niet-cijfer-scheidingsteken telt als decimaal-scheider;
 *  voorgaande puntjes/komma's zijn thousands-separators die we strippen. */
function normalizeNumeric(raw: string): string {
  const cleaned = raw.replace(/\s/g, '');
  if (!cleaned) return cleaned;
  // Vind de laatste . of , — die is de decimaal-scheider
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  const decimalIdx = Math.max(lastDot, lastComma);
  if (decimalIdx === -1) return cleaned;
  const intPart = cleaned.slice(0, decimalIdx).replace(/[.,]/g, '');
  const fracPart = cleaned.slice(decimalIdx + 1);
  // Heuristiek: als fracPart precies 3 chars is en alleen cijfers, was het
  // waarschijnlijk een thousands-separator, niet een decimaal. (Bv "1.000".)
  if (/^\d{3}$/.test(fracPart)) {
    return cleaned.replace(/[.,]/g, '');
  }
  // Trim trailing zeros in fracPart om "50.00" en "50" gelijk te maken
  const trimmed = fracPart.replace(/0+$/, '');
  return trimmed.length === 0 ? intPart : `${intPart}.${trimmed}`;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().replace(/[.,;:!?]+$/, '');
}

function normalizeUrl(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?]+$/, '')
    .replace(/\/+$/, '');
}

function normalizePhone(raw: string): string {
  // Strip alles behalve cijfers en `+` aan het begin
  const digits = raw.replace(/[^\d+]/g, '');
  // +31 6 12345678 → +31612345678 ; 06 12345678 → 0612345678
  return digits;
}

// ---------------------------------------------------------------------------
// Extract
// ---------------------------------------------------------------------------

/** Extract alle harde feiten uit een tekst. Money/percentages/numbers worden
 *  genormaliseerd naar cijfer-only form; emails/URLs lowercased; phones cijfer-
 *  only. Duplicaten worden gededupt per categorie.
 *
 *  Volgorde: money/date/percentage worden EERST gematcht en gestript voordat
 *  generic numbers gematcht worden — anders zou "€50" óók als number=50
 *  geëxtraheerd worden. Phones worden vóór numbers gematcht om PSTN-blobs
 *  apart te houden. */
export function extractHardFacts(text: string): ExtractedHardFacts {
  const out: ExtractedHardFacts = {
    money: [],
    percentages: [],
    datesOrYears: [],
    numbers: [],
    emails: [],
    urls: [],
    phones: [],
  };
  if (!text || typeof text !== 'string') return out;

  const moneyValues = new Set<string>();
  const percentValues = new Set<string>();
  const dateValues = new Set<string>();
  const numberValues = new Set<string>();
  const emailValues = new Set<string>();
  const urlValues = new Set<string>();
  const phoneValues = new Set<string>();

  // Track ranges die we al gematcht hebben zodat generic NUMBER_RE niet
  // overlapt met money/date/percentage/phone matches.
  const consumed: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) =>
    consumed.some(([s, e]) => start < e && end > s);
  const markConsumed = (start: number, end: number) => {
    consumed.push([start, end]);
  };

  // Money
  let m: RegExpExecArray | null;
  MONEY_RE.lastIndex = 0;
  while ((m = MONEY_RE.exec(text)) !== null) {
    const raw = m[1] ?? m[2];
    if (raw) {
      moneyValues.add(normalizeNumeric(raw));
      markConsumed(m.index, m.index + m[0].length);
    }
  }

  // Percentages
  PERCENT_RE.lastIndex = 0;
  while ((m = PERCENT_RE.exec(text)) !== null) {
    percentValues.add(normalizeNumeric(m[1]));
    markConsumed(m.index, m.index + m[0].length);
  }

  // Dates / years
  DATE_RE.lastIndex = 0;
  while ((m = DATE_RE.exec(text)) !== null) {
    const raw = m[1] ?? m[2];
    if (raw) {
      // Normaliseer date-separators naar `-` voor stabiele vergelijking
      const normalized = raw.replace(/[./]/g, '-');
      dateValues.add(normalized);
      markConsumed(m.index, m.index + m[0].length);
    }
  }

  // Emails
  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(text)) !== null) {
    emailValues.add(normalizeEmail(m[1]));
    markConsumed(m.index, m.index + m[0].length);
  }

  // URLs
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    urlValues.add(normalizeUrl(m[1]));
    markConsumed(m.index, m.index + m[0].length);
  }

  // Phones (vóór generic numbers)
  PHONE_RE.lastIndex = 0;
  while ((m = PHONE_RE.exec(text)) !== null) {
    phoneValues.add(normalizePhone(m[1]));
    markConsumed(m.index, m.index + m[0].length);
  }

  // Generic numbers (alleen wat niet al gematcht is)
  NUMBER_RE.lastIndex = 0;
  while ((m = NUMBER_RE.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (overlaps(start, end)) continue;
    numberValues.add(m[1]);
  }

  out.money = [...moneyValues];
  out.percentages = [...percentValues];
  out.datesOrYears = [...dateValues];
  out.numbers = [...numberValues];
  out.emails = [...emailValues];
  out.urls = [...urlValues];
  out.phones = [...phoneValues];
  return out;
}

// ---------------------------------------------------------------------------
// Support check
// ---------------------------------------------------------------------------

export type HardFactSupport = {
  /** True als alle harde feiten in `facts` voorkomen in minstens één source. */
  supported: boolean;
  /** De facts die NIET gevonden konden worden. Categorie-prefix voor leesbaarheid. */
  missing: string[];
};

/** Check of alle harde feiten in `facts` voorkomen (in dezelfde categorie) in
 *  minstens één van de `sourceTexts`. Vergelijking gebeurt op genormaliseerde
 *  form per categorie — "€50" in antwoord matcht "50 euro" in source.
 *
 *  - Leeg `facts` per categorie → niets te checken → supported=true.
 *  - Missing wordt geprefixt met categorie ("money:50", "phone:0612345678")
 *    zodat logging duidelijk laat zien wat ontbreekt. */
export function hardFactsSupportedBySources(
  facts: ExtractedHardFacts,
  sourceTexts: string[],
): HardFactSupport {
  if (!sourceTexts || sourceTexts.length === 0) {
    // Geen sources om tegen te checken — alleen 'supported' als ook geen
    // facts om te bewijzen. Anders alles missing.
    const allFacts: string[] = [];
    for (const cat of Object.keys(facts) as (keyof ExtractedHardFacts)[]) {
      for (const v of facts[cat]) allFacts.push(`${cat}:${v}`);
    }
    return {
      supported: allFacts.length === 0,
      missing: allFacts,
    };
  }

  // Bouw één geünificeerde "source-facts" set door extract over alle sources
  const sourceFacts = sourceTexts
    .map((s) => extractHardFacts(s))
    .reduce(
      (acc, cur) => ({
        money: [...new Set([...acc.money, ...cur.money])],
        percentages: [...new Set([...acc.percentages, ...cur.percentages])],
        datesOrYears: [...new Set([...acc.datesOrYears, ...cur.datesOrYears])],
        numbers: [...new Set([...acc.numbers, ...cur.numbers])],
        emails: [...new Set([...acc.emails, ...cur.emails])],
        urls: [...new Set([...acc.urls, ...cur.urls])],
        phones: [...new Set([...acc.phones, ...cur.phones])],
      }),
      {
        money: [],
        percentages: [],
        datesOrYears: [],
        numbers: [],
        emails: [],
        urls: [],
        phones: [],
      } as ExtractedHardFacts,
    );

  // Cross-category fallback: money kan ook gewoon als getal in source staan
  // (bv "kost 50 per maand" zonder euro-teken — onwaarschijnlijk maar wel
  // veilig). Voeg money/percentage waarden ook toe aan numbers voor
  // vergelijking — wel niet andersom (numbers→money zou onnodig false
  // positives geven).
  const numbersWithFallback = new Set([
    ...sourceFacts.numbers,
    ...sourceFacts.money,
    ...sourceFacts.percentages,
  ]);
  const moneyWithFallback = new Set([
    ...sourceFacts.money,
    ...sourceFacts.numbers,
  ]);

  const missing: string[] = [];

  for (const v of facts.money) {
    if (!moneyWithFallback.has(v)) missing.push(`money:${v}`);
  }
  const percentagesWithFallback = new Set([
    ...sourceFacts.percentages,
    ...sourceFacts.numbers,
  ]);
  for (const v of facts.percentages) {
    if (!percentagesWithFallback.has(v)) {
      missing.push(`percentage:${v}`);
    }
  }
  for (const v of facts.datesOrYears) {
    if (!sourceFacts.datesOrYears.includes(v)) missing.push(`date:${v}`);
  }
  for (const v of facts.numbers) {
    if (!numbersWithFallback.has(v)) missing.push(`number:${v}`);
  }
  for (const v of facts.emails) {
    if (!sourceFacts.emails.includes(v)) missing.push(`email:${v}`);
  }
  for (const v of facts.urls) {
    if (!sourceFacts.urls.includes(v)) missing.push(`url:${v}`);
  }
  for (const v of facts.phones) {
    if (!sourceFacts.phones.includes(v)) missing.push(`phone:${v}`);
  }

  return {
    supported: missing.length === 0,
    missing,
  };
}

/** Convenience helper voor de decision-layer in rag.ts: returnt true als de
 *  tekst minstens één hard fact bevat (geld/percentage/date/email/url/phone
 *  of een groot getal). Zegt NIETS over of die fact ondersteund wordt. */
export function containsHardFacts(text: string): boolean {
  const f = extractHardFacts(text);
  return (
    f.money.length > 0 ||
    f.percentages.length > 0 ||
    f.datesOrYears.length > 0 ||
    f.emails.length > 0 ||
    f.urls.length > 0 ||
    f.phones.length > 0 ||
    f.numbers.length > 0
  );
}
