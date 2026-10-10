// Marketingsite — prijzen, pakketten en bedrijfsgegevens. ÉÉN bron van waarheid.
//
// Spec: docs/superpowers/specs/2026-10-10-marketing-site-design.md §6. Copy letterlijk
// uit docs/site/COPY.md §10. Voorwerk voor V2: later lezen Mollie-billing en
// limiet-enforcement dezelfde config ("tiers leven in code", V2_SCOPE §4) — dus
// geen bedragen hardcoden in componenten, altijd via deze module + helpers.
//
// Alle bedragen in hele euro's, excl. btw, "per maand". `yearly` = de maandprijs bij
// jaarlijkse facturering (dus €29 p/m → €348 per jaar).
//
// Puur en framework-vrij: bruikbaar in server- én client-components en in node:test.

export type BillingCycle = 'yearly' | 'monthly';
export type PriceKind = 'intro' | 'normal';
export type TierId = 'start' | 'groei' | 'compleet';

export type FeatureId =
  | 'widget'
  | 'history'
  | 'leads'
  | 'quiz'
  | 'report'
  | 'fast'
  | 'unbrand'
  | 'onboarding';

/** Maandprijs per factureringsritme. */
export interface PriceSet {
  monthly: number;
  yearly: number;
}

export interface TierLimits {
  /** Harde maandlimiet vragen (V1 handhaaft limieten per org; zie migr V1-0027). */
  questionsPerMonth: number;
  /** null = op maat (Compleet). */
  pages: number | null;
  /** Weergavetekst, letterlijk uit COPY.md. */
  pagesLabel: string;
  /** null = onbeperkt (redelijk gebruik). */
  documents: number | null;
  documentsLabel: string;
}

export interface Tier {
  id: TierId;
  name: string;
  /** "Voor wie"-regel onder de naam. */
  who: string;
  /** Center-stage-pakket (navy kaart, badge, op mobiel eerst). */
  featured: boolean;
  /** Badge linksboven de kaart, of null. */
  badge: string | null;
  /** Doorgestreepte normale prijs (geldt na de eerste `introSpots` klanten). */
  normal: PriceSet;
  /** Introductieprijs (levenslang vastgezet voor de eerste `introSpots` klanten). */
  intro: PriceSet;
  limits: TierLimits;
  features: Record<FeatureId, boolean>;
  support: string;
  /** Knoptekst op de prijskaart. */
  cta: string;
}

/** Volgorde + labels van de functierijen in de vergelijkingstabel (COPY.md §10). */
export const FEATURES: ReadonlyArray<{ id: FeatureId; label: string }> = [
  { id: 'widget', label: 'Widget in eigen kleur + logo' },
  { id: 'history', label: 'Gesprekken teruglezen' },
  { id: 'leads', label: 'Contactverzoeken (leads)' },
  { id: 'quiz', label: 'Kennisgat-quiz + FAQ-inzichten' },
  { id: 'report', label: 'Maandrapport' },
  { id: 'fast', label: 'Fast mode' },
  { id: 'unbrand', label: '“Powered by ChatManta” weg' },
  { id: 'onboarding', label: 'Persoonlijke onboarding + kwartaalcheck' },
];

export const TIERS: ReadonlyArray<Tier> = [
  {
    id: 'start',
    name: 'Start',
    who: 'Voor wie wil beginnen met de standaardvragen',
    featured: false,
    badge: null,
    normal: { monthly: 49, yearly: 39 },
    intro: { monthly: 35, yearly: 29 },
    limits: {
      questionsPerMonth: 500,
      pages: 25,
      pagesLabel: '25',
      documents: 10,
      documentsLabel: '10',
    },
    features: {
      widget: true,
      history: true,
      leads: false,
      quiz: false,
      report: false,
      fast: false,
      unbrand: false,
      onboarding: false,
    },
    support: 'Elke werkdag, reactie binnen 1 werkdag',
    cta: 'Kies Start',
  },
  {
    id: 'groei',
    name: 'Groei',
    who: 'Voor bedrijven die er klanten mee willen winnen',
    featured: true,
    badge: 'Aanbevolen',
    normal: { monthly: 99, yearly: 79 },
    intro: { monthly: 69, yearly: 57 },
    limits: {
      questionsPerMonth: 2000,
      pages: 50,
      pagesLabel: '50',
      documents: 50,
      documentsLabel: '50',
    },
    features: {
      widget: true,
      history: true,
      leads: true,
      quiz: true,
      report: true,
      fast: true,
      unbrand: false,
      onboarding: false,
    },
    support: '24/7 bereikbaar, reactie binnen 24 uur',
    cta: 'Kies Groei',
  },
  {
    id: 'compleet',
    name: 'Compleet',
    who: 'Voor grotere sites en wie het volledig uit handen geeft',
    featured: false,
    badge: null,
    normal: { monthly: 249, yearly: 199 },
    intro: { monthly: 179, yearly: 149 },
    limits: {
      questionsPerMonth: 7500,
      pages: null,
      pagesLabel: 'Hele site — op maat, in overleg',
      documents: null,
      documentsLabel: 'Onbeperkt (redelijk gebruik)',
    },
    features: {
      widget: true,
      history: true,
      leads: true,
      quiz: true,
      report: true,
      fast: true,
      unbrand: true,
      onboarding: true,
    },
    support: '24/7 prioriteit, reactie binnen 4 uur',
    cta: 'Kies Compleet',
  },
];

export const PRICING = {
  currency: 'EUR',
  /** Alle bedragen excl. btw. */
  vatIncluded: false,
  /** Toggle staat standaard op jaarlijks (spec §6). */
  defaultCycle: 'yearly' as BillingCycle,
  yearlyLabel: '2 maanden gratis',
  /** Label naast de doorgestreepte normale prijs. */
  anchorLabel: 'normaal, na de eerste 25 klanten',
  /** Aantal klanten dat de introductieprijs krijgt. */
  introSpots: 25,
  /** Plekken-teller UIT tot er genoeg klanten zijn (spec §6) — nooit nep-schaarste. */
  showSpotsCounter: false,
  /** Waarde van de gratis inrichting, in euro's. */
  setupValue: 199,
  trialDays: 14,
  /** Kostenvergelijking boven de prijzen: medewerker 1 uur/dag. */
  staffComparison: { hourlyRate: 30, hoursPerDay: 1, workdaysPerMonth: 21.7 },
  tiers: TIERS,
} as const;

/** Bedrijfs-/contactgegevens voor footer, slot-CTA en kennismaking. */
export const SITE_COMPANY = {
  name: 'ChatManta',
  email: 'info@chatmanta.com',
  /** KvK-nummer: nog niet beschikbaar → niet tonen zolang null (spec §5.14). */
  kvk: null as string | null,
} as const;

// ---------------------------------------------------------------------------
// Helpers (puur)
// ---------------------------------------------------------------------------

const intFormatter = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const centsFormatter = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "2.000", "7.500" — nl-NL duizendtallen, zonder decimalen. */
export function formatNumber(n: number): string {
  return intFormatter.format(n);
}

/**
 * Euroformattering zoals in de mockup: "€29", "€1.788", of met `cents: true` "€24,95".
 * Bewust zonder spatie na het €-teken (Intl nl-NL currency zet er een spatie tussen).
 */
export function formatEuro(n: number, opts: { cents?: boolean } = {}): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}€${opts.cents ? centsFormatter.format(abs) : intFormatter.format(abs)}`;
}

export function getTier(id: TierId): Tier {
  const tier = TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Onbekend pakket: ${id}`);
  return tier;
}

/** Maandprijs voor dit pakket bij dit ritme (intro = de prijs die je nu betaalt). */
export function monthlyPrice(tier: Tier, cycle: BillingCycle, kind: PriceKind = 'intro'): number {
  return tier[kind][cycle];
}

/** Totaal per jaar bij jaarlijkse facturering: €29 → €348, €57 → €684, €149 → €1.788. */
export function yearlyTotal(tier: Tier, kind: PriceKind = 'intro'): number {
  return tier[kind].yearly * 12;
}

/** Hele euro's per dag, naar boven afgerond (zelfde formule als de mockup). */
export function perDayCeil(monthly: number): number {
  return Math.ceil((monthly * 12) / 365);
}

/** Dagframing per toggle-stand: Groei jaarlijks → "Minder dan €2 per dag", maandelijks → "€3". */
export function dayFraming(tier: Tier, cycle: BillingCycle, kind: PriceKind = 'intro'): string {
  return `Minder dan ${formatEuro(perDayCeil(monthlyPrice(tier, cycle, kind)))} per dag`;
}

/** Regel onder de prijs: jaarlijks met jaartotaal, maandelijks zonder. */
export function billedLine(tier: Tier, cycle: BillingCycle, kind: PriceKind = 'intro'): string {
  return cycle === 'yearly'
    ? `p/m, jaarlijks gefactureerd (${formatEuro(yearlyTotal(tier, kind))} per jaar)`
    : 'maandelijks gefactureerd';
}

/** Kosten van een medewerker die `hoursPerDay` uur per dag klantvragen beantwoordt (±€650). */
export function staffCostPerMonth(
  cfg: { hourlyRate: number; hoursPerDay: number; workdaysPerMonth: number } = PRICING.staffComparison,
): number {
  return cfg.hourlyRate * cfg.hoursPerDay * cfg.workdaysPerMonth;
}

/** Afronden op een veelvoud (bijv. 651 → 650 met step 50) voor "±"-bedragen. */
export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}
