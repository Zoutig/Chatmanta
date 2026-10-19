// V1 admin — welke orgs zijn intern (eval-, seed-, test- en demo-orgs)?
//
// PUUR (geen DB, geen server-only), zodat het te testen is en door elk
// cross-org-overzicht gedeeld wordt (Overzicht, Klanten, Onboarding, Gebruik,
// Botprestaties, Maandrecap). Zonder migratie: er is (nog) geen kolom
// organizations.is_internal, dus we leiden het af uit bestaande velden:
//
//  1. Een expliciet gezette commerciële status die níet 'internal_test' is
//     (trial/active/paused/cancellation) wint altijd: zo'n org is een klant,
//     ook als de slug toevallig op een patroon lijkt. Dat is de ontsnapping
//     voor een echte klant met een ongelukkige naam: zet zijn status in het
//     profiel op Trial of Actief.
//  2. Anders: slug-patronen van de bekende interne bronnen
//     - `eval-…`        lib/evals/eval-orgs.ts (fictieve eval-corpora)
//     - `seed-org…`     scripts/v1-seed.mjs (seed-org, seed-org-b)
//     - `testbedrijf…`  handmatig aangemaakte testorgs
//     - `test-…`/`demo-…` algemene conventie
//     - DEMO_ORG_SLUG   de publieke demo (lib/voorbeeld/constants.ts)
//
// Let op: de standaard commerciële status (zonder profielrij) is óók
// 'internal_test' (PROFILE_DEFAULTS). Die zegt dus niets en telt hier niet mee.

import { DEMO_ORG_SLUG } from '@/lib/voorbeeld/constants';

// Segment-grenzen: 'seed-org' en 'testbedrijf' alleen als heel woord (gevolgd door '-'
// of het einde), zodat bv. 'seed-organics' of 'testbedrijfsauto' een klant blijft.
const INTERNAL_SLUG_PATTERN = /^(?:(?:eval|test|demo)-|(?:seed-org|testbedrijf)(?:-|$))/;

const CUSTOMER_STATUSES = new Set(['trial', 'active', 'paused', 'cancellation']);

export type InternalOrgInput = {
  slug: string;
  /** Alleen meegeven als er een échte profielrij is (niet de default). */
  explicitCommercialStatus?: string | null;
};

export function isInternalOrg({ slug, explicitCommercialStatus }: InternalOrgInput): boolean {
  if (explicitCommercialStatus && CUSTOMER_STATUSES.has(explicitCommercialStatus)) return false;
  const s = slug.trim().toLowerCase();
  if (s === DEMO_ORG_SLUG) return true;
  return INTERNAL_SLUG_PATTERN.test(s);
}

/** Querystring-sleutel voor de schakelaar 'Toon interne orgs'. */
export const SHOW_INTERNAL_PARAM = 'intern';

/** Leest de schakelaar uit (Next searchParams-waarde: string | string[] | undefined). */
export function parseShowInternal(value: string | string[] | undefined): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return v === '1';
}

/** Filtert een lijst; `showInternal` = alles tonen. Geeft ook het aantal verborgen terug. */
export function filterInternalOrgs<T>(
  items: T[],
  toInput: (item: T) => InternalOrgInput,
  showInternal: boolean,
): { visible: T[]; hiddenCount: number } {
  if (showInternal) return { visible: items, hiddenCount: 0 };
  const visible = items.filter((i) => !isInternalOrg(toInput(i)));
  return { visible, hiddenCount: items.length - visible.length };
}
