// V1 admin — gedeelde org-lijst voor alle cross-org-overzichten: niet-verwijderde
// orgs + hun admin-profiel, met interne orgs (eval/seed/test/demo) standaard eruit
// gefilterd. Licht (geen V0-imports), zodat ook bot-performance en recap hem
// kunnen gebruiken zonder de hele overview-fan-out mee te trekken.

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PROFILE_DEFAULTS,
  type AdminOrgProfile,
  type CommercialStatus,
  type OnboardingPhase,
  type Owner,
  type TechnicalStatus,
} from '@/lib/controlroom/types';
import { filterInternalOrgs } from './internal-orgs';

// ---------------------------------------------------------------------------
// Profile-laag — inline variant van profiles.ts (zonder V0-sb() side-effect)
// ---------------------------------------------------------------------------

type ProfileRow = {
  organization_id: string;
  commercial_status: string;
  technical_status_override: string | null;
  onboarding_phase: string;
  customer_owner: string;
  technical_owner: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_owner: string | null;
  next_action_due_date: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToProfile(r: ProfileRow): AdminOrgProfile {
  return {
    organizationId: r.organization_id,
    commercialStatus: r.commercial_status as CommercialStatus,
    technicalStatusOverride: (r.technical_status_override as TechnicalStatus | null) ?? null,
    onboardingPhase: r.onboarding_phase as OnboardingPhase,
    customerOwner: r.customer_owner as Owner,
    technicalOwner: r.technical_owner as Owner,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    notes: r.notes,
    nextAction: r.next_action,
    nextActionOwner: (r.next_action_owner as Owner | null) ?? null,
    nextActionDueDate: r.next_action_due_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function defaultProfile(orgId: string): AdminOrgProfile {
  return {
    organizationId: orgId,
    commercialStatus: PROFILE_DEFAULTS.commercialStatus,
    technicalStatusOverride: null,
    onboardingPhase: PROFILE_DEFAULTS.onboardingPhase,
    customerOwner: PROFILE_DEFAULTS.customerOwner,
    technicalOwner: PROFILE_DEFAULTS.technicalOwner,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    notes: null,
    nextAction: null,
    nextActionOwner: null,
    nextActionDueDate: null,
    createdAt: '',
    updatedAt: '',
  };
}

/** Batch-read admin_org_profile over alle org-ids; ontbrekende orgs krijgen een
 *  virtuele default (read-first, geen write nodig voor weergave). */
export async function getProfilesMap(
  admin: SupabaseClient,
  orgIds: string[],
): Promise<Map<string, AdminOrgProfile>> {
  const map = new Map<string, AdminOrgProfile>();
  for (const id of orgIds) map.set(id, defaultProfile(id));
  if (orgIds.length === 0) return map;
  const { data } = await admin
    .from('admin_org_profile')
    .select('*')
    .in('organization_id', orgIds);
  for (const r of data ?? []) {
    map.set((r as ProfileRow).organization_id, rowToProfile(r as ProfileRow));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Org-lijst
// ---------------------------------------------------------------------------

export type AdminOrgRow = { id: string; name: string; slug: string };

export type AdminOrgListOptions = {
  /** true = ook eval-, seed-, test- en demo-orgs (schakelaar 'Toon interne orgs'). */
  showInternal?: boolean;
};

/** Alle niet-verwijderde V1-orgs + hun profiel, met interne orgs standaard eruit
 *  gefilterd (lib/v1/admin/internal-orgs.ts). Eén plek voor elk cross-org-overzicht.
 *  Filteren vóór de fan-out scheelt ook ~14 queries per verborgen org. */
export async function listAdminOrgs(
  admin: SupabaseClient,
  opts: AdminOrgListOptions = {},
): Promise<{ orgs: AdminOrgRow[]; profiles: Map<string, AdminOrgProfile>; hiddenCount: number }> {
  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name, slug')
    .is('deleted_at', null)
    .order('name', { ascending: true });

  const all = (orgs ?? []) as AdminOrgRow[];
  const profiles = await getProfilesMap(admin, all.map((o) => o.id));
  const { visible, hiddenCount } = filterInternalOrgs(
    all,
    (o) => {
      const p = profiles.get(o.id);
      // createdAt '' = virtuele default (geen profielrij) → status zegt niets.
      return { slug: o.slug, explicitCommercialStatus: p && p.createdAt ? p.commercialStatus : null };
    },
    opts.showInternal === true,
  );
  return { orgs: visible, profiles, hiddenCount };
}

