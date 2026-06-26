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
 *    zodat logging duidelijk laat zien wat ontbreekt.
 *
 *  Options:
 *  - numericFallback (default true) — bepaalt of money/percent/number
 *    cross-categorie kunnen matchen. v0.6.1/v0.6.2 gedrag = true. v0.6.3+
 *    zet dit op false om €249-class hallucinaties te vangen waar "249"
 *    enkel als substring in een chunk voorkomt zonder valuta-context. */
export function hardFactsSupportedBySources(
  facts: ExtractedHardFacts,
  sourceTexts: string[],
  options?: { numericFallback?: boolean },
): HardFactSupport {
  const numericFallback = options?.numericFallback !== false;
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

  // Cross-category fallback (v0.6.1/v0.6.2 default): money/percent kunnen
  // matchen tegen generieke `numbers` in source — vangt "kost 50 per maand"
  // zonder euro-teken. Maar geeft ook false positives: "€249 Business tier"
  // passeert als "249" als substring in een chunk staat (bv. pricing-tabel
  // "€0,07 / extra | 300 gesprekken"). V0.6.3 schakelt deze fallback uit.
  const numbersWithFallback = numericFallback
    ? new Set([
        ...sourceFacts.numbers,
        ...sourceFacts.money,
        ...sourceFacts.percentages,
      ])
    : new Set(sourceFacts.numbers);
  const moneyWithFallback = numericFallback
    ? new Set([...sourceFacts.money, ...sourceFacts.numbers])
    : new Set(sourceFacts.money);

  const missing: string[] = [];

  for (const v of facts.money) {
    if (!moneyWithFallback.has(v)) missing.push(`money:${v}`);
  }
  const percentagesWithFallback = numericFallback
    ? new Set([...sourceFacts.percentages, ...sourceFacts.numbers])
    : new Set(sourceFacts.percentages);
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

// v0.9.1 — markers voor een spoed-/nood-/escalatie-doorverwijzing in een
// ANTWOORD. Bewust krap op échte nood-routing (geen losse "neem contact op")
// zodat een normaal prijs-/datum-fabricatie-antwoord — dat deze termen nooit
// bevat — gewoon door de hard-fact-weiger-gate blijft gaan. Het bare getal
// "112" wordt NIET los gematcht (zou een verzonnen "€112"-prijs als handoff
// kunnen aanzien); alleen in routing-context ("bel 112", "112 bellen").
const EMERGENCY_HANDOFF_MARKERS: RegExp[] = [
  /huisartsenpost/i,
  /\bhuisarts\b/i,
  /spoedeisende\s+hulp/i,
  /\bspoedpost\b/i,
  /\bSEH\b/,
  /\bambulance\b/i,
  /alarm(?:nummer|centrale)/i,
  /\bbrandweer\b/i,
  /\bhulpdiensten\b/i,
  /direct(?:e)?\s+medische\s+hulp/i,
  /medische\s+(?:hulp|noodhulp|zorg)\s+(?:in(?:schakelen|roepen)|nodig|zoeken|raadplegen)/i,
  /\bbel\s+(?:direct|onmiddellijk|meteen|nu|gelijk|zo\s+snel\s+mogelijk|112|113|911)\b/i,
  /\b(?:112|113|911)\s+(?:moet\s+(?:je|u)\s+)?bell?en\b/i,
  /\bemergency\s+(?:services|room)\b/i,
  /\bcall\s+911\b/i,
];

/** v0.9.1 — detecteert of een ANTWOORD een spoed-/nood-doorverwijzing bevat
 *  (112/huisartsenpost/ambulance/spoedeisende hulp …). Gebruikt door de
 *  decision-layer in rag.ts om te voorkomen dat de deterministische hard-fact-
 *  weigering een levensreddende doorverwijzing overschrijft: het noodnummer
 *  "112" telt via NUMBER_RE als ongegrond hard feit omdat het per definitie
 *  niet in een fysio-/dakdekker-/boekhoud-corpus staat (zie de v0.9-regressie
 *  op hh-globex-spoed). Pure functie → tsx-testbaar, geen side-effects. */
export function containsEmergencyHandoff(text: string): boolean {
  const clean = text.replace(/\*/g, '');
  return EMERGENCY_HANDOFF_MARKERS.some((re) => re.test(clean));
}

// v0.9.1 — markers voor CODE in een antwoord. Een klantcontact-bot van een niet-
// technische org (dakdekker/fysio/accountant) hoort nooit code te produceren, dus
// een code-block/programmeer-syntax = off-domein task-execution. Een prompt-regel
// alleen houdt gpt-4o-mini hier niet betrouwbaar tegen (scope-acme-code flake), dus
// een deterministische output-guard. Bewust krap op echte code-syntax → een normaal
// proza-antwoord (geen ``` , geen def/function/for-in-range) triggert niet.
const CODE_OUTPUT_MARKERS: RegExp[] = [
  /```/, // markdown code-fence
  /\bdef\s+\w+\s*\(/, // python def
  /\bfunction\s+\w+\s*\(/, // js function-declaratie
  /=>\s*\{/, // arrow function body
  /\bconsole\.log\s*\(/,
  /\bprintf?\s*\(/, // print( / printf(
  /\bfor\s+\w+\s+in\s+range\s*\(/, // python loop
  /\breturn\s+(?:True|False|null|nil)\b/,
  /#include\s*</,
  /\b(?:public|private)\s+(?:static\s+)?(?:class|void|int|String)\b/,
  /\bSystem\.out\b/,
];

/** v0.9.1 — detecteert of een ANTWOORD code/programmeer-output bevat. Gebruikt door
 *  de decision-layer in rag.ts (offDomainCodeRefusal) om een off-domein code-antwoord
 *  deterministisch te vervangen door de off-topic-refusal. Pure functie, geen side-
 *  effects. Krap op echte code-syntax → geen false-positives op proza-antwoorden. */
export function containsCodeOutput(text: string): boolean {
  return CODE_OUTPUT_MARKERS.some((re) => re.test(text));
}

/** iter2 v0.9 — beslis of een ongegronde hard-fact-hallucinatie DETERMINISTISCH
 *  geweigerd moet worden i.p.v. een tweede LLM-poging (die empirisch onbetrouwbaar
 *  is in het verwijderen van het verzonnen getal — zie de v0.8.1 history-entity
 *  les in rag.ts). Dit is de dominante `out_of_corpus_overanswer`-faalmodus uit de
 *  iter2 sub-taxonomy: de bot noemt een specifiek bedrag/datum/aantal dat niet in
 *  de bronnen staat op een vraag die uit het corpus niet te beantwoorden is.
 *
 *  KERN — de RETRIEVAL-STERKTE is de regressie-mitigatie: vuur alléén wanneer de
 *  hard-fact niet in de bron staat ÉN de retrieval ZWAK/MEDIUM was. claim-confidence
 *  scheidt deze gevallen NIET (een fabricatie heeft confidence≈1 — embeddings matchen
 *  vorm, niet waarde; dat is juist waarom de hard-fact-verifier bestaat). Empirisch
 *  (iter2-smoke): een out_of_corpus-fabricatie haalt retrievalStrength='medium', een
 *  gegronde tiered-Vpb-calc 'strong'. 'strong' = directe brondekking (bv. tax-doc met
 *  tarieven) → NIET weigeren (geen over-refusal op correcte rekenkunde). 'none' =
 *  zero-hits, al afgehandeld door reclassifyAfterZeroHits.
 *
 *  v0.9.1 — safety-aware verfijning (flag-guarded via `safetyAware`): weiger NOOIT
 *  een draft die al een spoed-/nood-doorverwijzing bevat (`draftHasSafetyHandoff`),
 *  zodat een correct "bel 112/huisarts"-noodadvies niet door de generieke hard-
 *  fact-weigering wordt overschreven. Het noodnummer telt via NUMBER_RE als
 *  ongegrond getal maar staat per definitie niet in het corpus — zie de v0.9-
 *  regressie op hh-globex-spoed. `safetyAware` undefined/false → v0.9 byte-identiek.
 *
 *  Pure functie → tsx-testbaar (scripts/test-iter2-fix.ts), geen side-effects. */
export function shouldDeterministicallyRefuseHardFact(args: {
  /** bot.hardFactDeterministicRefusal — flag-guard; false → v0.8.1-gedrag. */
  enabled: boolean;
  /** result.hardFactSupported (undefined = verifier draaide niet). */
  hardFactSupported: boolean | undefined;
  /** decision.retrievalStrength (undefined = geen adaptive decision). */
  retrievalStrength: 'none' | 'weak' | 'medium' | 'strong' | undefined;
  /** Al deterministisch afgehandeld door de history-entity-tak → niet dubbel. */
  adoptedHistoryEntity: boolean;
  /** v0.9.1 — bot.hardFactRefusalSafetyAware; false/undefined → v0.9-gedrag. */
  safetyAware?: boolean;
  /** v0.9.1 — draft bevat al een nood-/escalatie-doorverwijzing (alleen relevant
   *  wanneer safetyAware): true → niet weigeren (spaar de doorverwijzing). */
  draftHasSafetyHandoff?: boolean;
  /** v0.10 (C11) — bot.hardFactRefusalFabricationClassOnly. Beperkt de gate tot de
   *  schadelijke fabricatie-klasse: vuur alléén wanneer een ONGEGROND feit in
   *  {money, percentage, date, email, url, phone} valt, NIET bij een puur benign
   *  generiek getal (categorie `number:` — aantal/los nummer). false/undefined →
   *  v0.9.3-gedrag (élk ongegrond hard feit gate't). */
  fabricationClassOnly?: boolean;
  /** v0.10 (C11) — categorie-geprefixte missing-facts ("money:50","number:20",…) uit
   *  hardFactsSupportedBySources. Alleen geraadpleegd wanneer fabricationClassOnly. */
  missingHardFacts?: string[];
}): boolean {
  const {
    enabled,
    hardFactSupported,
    retrievalStrength,
    adoptedHistoryEntity,
    safetyAware,
    draftHasSafetyHandoff,
    fabricationClassOnly,
    missingHardFacts,
  } = args;
  if (!enabled || adoptedHistoryEntity) return false;
  // v0.9.1: een correcte nood-/escalatie-doorverwijzing mag nooit door de
  // generieke hard-fact-weigering worden vervangen.
  if (safetyAware && draftHasSafetyHandoff) return false;
  const unsupportedHardFact = hardFactSupported === false;
  // Gevarenzone: zwakke/medium retrieval (over-answer-risico). STRONG = gegronde
  // directe match → spaar correcte calc. NONE → al afgehandeld vóór dit punt.
  const weakRetrieval = retrievalStrength === 'weak' || retrievalStrength === 'medium';
  if (!unsupportedHardFact || !weakRetrieval) return false;
  // v0.10 (C11) — fabricatie-klasse-lever. Een gegrond antwoord dat een benign
  // generiek getal (aantal/los nummer) noemt dat net niet exact in de bron staat,
  // landt bij medium-retrieval (top1Sim 0,50–0,56) anders onder de generieke
  // hard-fact-weigering → over-refusal. Onder de flag vuurt de gate daarom alléén
  // wanneer minstens één ONGEGROND feit BUITEN de benign `number:`-categorie valt
  // (geld/percentage/datum/email/url/telefoon = de schadelijke fabricatie-klasse,
  // die volledig gegate blijft). Een ongegrond bedrag/datum/contactgegeven weigert
  // dus nog steeds; alleen een los benign getal niet. (Bewust strikter dan de spec-
  // letter "money/%/date" — email/url/phone blijven mee-gegate: veiligheid eerst.)
  if (fabricationClassOnly) {
    const hasDangerousFabrication = (missingHardFacts ?? []).some(
      (m) => !m.startsWith('number:'),
    );
    if (!hasDangerousFabrication) return false;
  }
  return true;
}
