// V1 admin-overlay — admin_org_profile (1 rij per org).
//
// Faithful port van lib/controlroom/server/profiles.ts. De V1-tabel heeft een
// echte FK -> organizations(id) en geen KNOWN_ORGS-app-constants; het service-
// role-client (getJorionAdminClient) bypast RLS (tabel heeft RLS aan, geen policy).

import 'server-only';

import { getJorionAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PROFILE_DEFAULTS,
  type AdminOrgProfile,
  type AdminOrgProfilePatch,
  type CommercialStatus,
  type OnboardingPhase,
  type Owner,
  type TechnicalStatus,
} from '@/lib/controlroom/types';

// Admin-client type-alias — alles dat we gebruiken is .from().select/upsert/update
type AdminClient = Awaited<ReturnType<typeof getJorionAdminClient>>;

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

function rowToProfile(r: ProfileRow): AdminOrgProfile {
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

/** Virtuele default — geen rij in DB → dezelfde defaults als V0 (read-first). */
export function defaultProfile(organizationId: string): AdminOrgProfile {
  return {
    organizationId,
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

function patchToRow(patch: AdminOrgProfilePatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.commercialStatus !== undefined) row.commercial_status = patch.commercialStatus;
  if (patch.technicalStatusOverride !== undefined) row.technical_status_override = patch.technicalStatusOverride;
  if (patch.onboardingPhase !== undefined) row.onboarding_phase = patch.onboardingPhase;
  if (patch.customerOwner !== undefined) row.customer_owner = patch.customerOwner;
  if (patch.technicalOwner !== undefined) row.technical_owner = patch.technicalOwner;
  if (patch.contactName !== undefined) row.contact_name = patch.contactName;
  if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail;
  if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.nextAction !== undefined) row.next_action = patch.nextAction;
  if (patch.nextActionOwner !== undefined) row.next_action_owner = patch.nextActionOwner;
  if (patch.nextActionDueDate !== undefined) row.next_action_due_date = patch.nextActionDueDate;
  return row;
}

export async function getProfile(admin: AdminClient, organizationId: string): Promise<AdminOrgProfile> {
  const { data, error } = await admin
    .from('admin_org_profile')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`getProfile V1 failed: ${error.message}`);
  return data ? rowToProfile(data as ProfileRow) : defaultProfile(organizationId);
}

export async function upsertProfile(
  admin: AdminClient,
  organizationId: string,
  patch: AdminOrgProfilePatch,
): Promise<AdminOrgProfile> {
  const row = { organization_id: organizationId, ...patchToRow(patch) };
  const { data, error } = await admin
    .from('admin_org_profile')
    .upsert(row, { onConflict: 'organization_id' })
    .select('*')
    .single();
  if (error) throw new Error(`upsertProfile V1 failed: ${error.message}`);
  return rowToProfile(data as ProfileRow);
}
