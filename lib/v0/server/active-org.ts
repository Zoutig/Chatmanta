// V0.4 multi-org sandbox — active-org resolutie en bekende fake orgs.
//
// ⚠️ SECURITY-MODEL — V0 IS GEEN MULTI-TENANT-VEILIGE LAAG ⚠️
// ----------------------------------------------------------------------------
// V0 heeft één gedeeld `V0_DEMO_PASSWORD` (zie auth-cookie.ts) — er is geen
// per-user identiteit. De `v0_active_org` cookie is daarom NIET aan een user
// gebonden en de `?org=<slug>` query-param wordt zonder authorisatie
// geaccepteerd. Elke ingelogde V0-bezoeker kan vrij switchen tussen alle
// KNOWN_ORGS slugs en zo data van andere "orgs" lezen/schrijven/verwijderen
// via de service-role wrappers in rag.ts/threads.ts/log.ts.
//
// Dit is bewust — V0 is sandbox met fake demo-data voor RAG-tuning, niet
// een multi-tenant productie-laag. ⛔ STOP NOOIT ECHTE KLANTDATA in een V0
// org. De V1 hard rule "Object-level access (SA-1)" geldt hier expliciet
// niet; V1 Phase 1 (Supabase Auth + organization_members membership-check)
// vervangt deze hele resolver.
// ----------------------------------------------------------------------------
//
// Bron-van-waarheid voor V0: hieronder staan stable UUIDs voor de 3
// sandbox-orgs (acme-corp, globex-inc, initech) plus de bestaande DEV_ORG.
// Deze UUIDs zijn deterministisch zodat re-seed scripts en test-runs
// dezelfde rows raken. In V1 worden orgs door Jorion-admin aangemaakt en
// de UUIDs zijn dan random — deze hard-coded keuze is V0-only.
//
// Active-org bepaling: query-param `?org=<slug>` heeft voorrang, dan
// cookie `v0_active_org`, dan fallback DEV_ORG. Cookie wordt later door de
// UI-switcher gezet (separate werk).

import 'server-only';

import { cookies } from 'next/headers';
import { DEV_ORG_ID } from './rag';

export type OrgSlug = 'dev-org' | 'acme-corp' | 'globex-inc' | 'initech';

export type KnownOrg = {
  id: string;
  slug: OrgSlug;
  name: string;
};

export const KNOWN_ORGS: Record<OrgSlug, KnownOrg> = {
  'dev-org': {
    id: DEV_ORG_ID,
    slug: 'dev-org',
    name: 'Dev Org',
  },
  'acme-corp': {
    id: '00000000-0000-0000-0000-0000000000a1',
    slug: 'acme-corp',
    name: 'Dakwerken De Boer',
  },
  'globex-inc': {
    id: '00000000-0000-0000-0000-0000000000a2',
    slug: 'globex-inc',
    name: 'FysioPlus Utrecht',
  },
  initech: {
    id: '00000000-0000-0000-0000-0000000000a3',
    slug: 'initech',
    name: 'Bakker & Vermeer Accountants',
  },
};

export const ALL_ORG_SLUGS = Object.keys(KNOWN_ORGS) as OrgSlug[];

export const ACTIVE_ORG_COOKIE = 'v0_active_org';
const COOKIE_NAME = ACTIVE_ORG_COOKIE;

/**
 * Resolve een org-slug naar UUID. Onbekende slugs → null (caller besluit
 * over fallback gedrag, meestal DEV_ORG).
 */
export function resolveOrgIdFromSlug(slug: string): string | null {
  if (!slug) return null;
  const known = (KNOWN_ORGS as Record<string, KnownOrg | undefined>)[slug];
  return known?.id ?? null;
}

/**
 * Inverse van resolveOrgIdFromSlug: van UUID naar slug. Onbekende ID → null.
 * Wordt gebruikt door route-handlers die wel een orgId hebben (via
 * getActiveOrgId) maar een slug nodig hebben om per-org settings/Q&A te
 * laden uit v0_org_settings (die is op slug gekeyed in de getOrgSettings
 * wrapper).
 */
export function resolveOrgSlugFromId(orgId: string): OrgSlug | null {
  if (!orgId) return null;
  for (const slug of ALL_ORG_SLUGS) {
    if (KNOWN_ORGS[slug].id === orgId) return slug;
  }
  return null;
}

/**
 * Bepaal de actieve org voor deze request. Volgorde:
 *   1. ?org=<slug> query param
 *   2. cookie v0_active_org
 *   3. fallback DEV_ORG_ID
 *
 * Onbekende slug → fallback (geen error). De UI-switcher schrijft bekende
 * slugs in de cookie, dus dit pad is alleen relevant bij user-tampering.
 */
export function getActiveOrgId(req: Request): string {
  // Query param eerst — handig voor test-URLs en CLI-scripts.
  try {
    const url = new URL(req.url);
    const qpSlug = url.searchParams.get('org');
    if (qpSlug) {
      const id = resolveOrgIdFromSlug(qpSlug);
      if (id) return id;
    }
  } catch {
    // Malformed URL — val terug op cookie / default.
  }

  // Cookie als fallback — UI-switcher schrijft hier.
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
    if (match) {
      const slug = decodeURIComponent(match[1]);
      const id = resolveOrgIdFromSlug(slug);
      if (id) return id;
    }
  }

  return DEV_ORG_ID;
}

/**
 * Server component / server action variant: leest de cookie via next/headers.
 * Geen Request-object nodig — voor pages, actions, en `revalidatePath`-flows.
 */
export async function getActiveOrgFromCookies(): Promise<{ slug: OrgSlug; id: string }> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (raw) {
    const slug = decodeURIComponent(raw) as OrgSlug;
    if (slug in KNOWN_ORGS) {
      return { slug, id: KNOWN_ORGS[slug].id };
    }
  }
  return { slug: 'dev-org', id: DEV_ORG_ID };
}

/**
 * Lijst van alle bekende sandbox-orgs voor de UI-switcher. Server-only file
 * dus prima om vanuit een server-component te gebruiken — bevat geen secrets,
 * alleen UUID + label.
 */
export function listKnownOrgs(): KnownOrg[] {
  return ALL_ORG_SLUGS.map((s) => KNOWN_ORGS[s]);
}
