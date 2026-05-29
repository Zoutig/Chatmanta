// Control Room — admin_org_profile storage (1 rij per tenant-org).
//
// getProfile/getProfilesMap geven een virtuele default terug voor orgs zonder
// rij, zodat de Overview/klantenlijst alle KNOWN_ORGS read-first kan tonen vóór
// er ooit een write is gebeurd. upsertProfile schrijft op de eerste edit.

import 'server-only';

import {
  PROFILE_DEFAULTS,
  type AdminOrgProfile,
  type AdminOrgProfilePatch,
  type CommercialStatus,
  type OnboardingPhase,
  type Owner,
  type TechnicalStatus,
} from '../types';
import { sb } from './db';

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
    technicalStatusOverride:
      (r.technical_status_override as TechnicalStatus | null) ?? null,
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

/** Virtuele default voor een org zonder profiel-rij (read-first). Niet
 *  persistent — createdAt/updatedAt blijven leeg tot de eerste write. */
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
  if (patch.technicalStatusOverride !== undefined)
    row.technical_status_override = patch.technicalStatusOverride;
  if (patch.onboardingPhase !== undefined) row.onboarding_phase = patch.onboardingPhase;
  if (patch.customerOwner !== undefined) row.customer_owner = patch.customerOwner;
  if (patch.technicalOwner !== undefined) row.technical_owner = patch.technicalOwner;
  if (patch.contactName !== undefined) row.contact_name = patch.contactName;
  if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail;
  if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.nextAction !== undefined) row.next_action = patch.nextAction;
  if (patch.nextActionOwner !== undefined) row.next_action_owner = patch.nextActionOwner;
  if (patch.nextActionDueDate !== undefined)
    row.next_action_due_date = patch.nextActionDueDate;
  return row;
}

export async function getProfile(organizationId: string): Promise<AdminOrgProfile> {
  const { data, error } = await sb()
    .from('admin_org_profile')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`getProfile failed: ${error.message}`);
  return data ? rowToProfile(data as ProfileRow) : defaultProfile(organizationId);
}

/** Batch-read voor de Overview/klantenlijst: één query over alle org-id's,
 *  ontbrekende orgs krijgen een virtuele default. */
export async function getProfilesMap(
  organizationIds: string[],
): Promise<Map<string, AdminOrgProfile>> {
  const map = new Map<string, AdminOrgProfile>();
  for (const id of organizationIds) map.set(id, defaultProfile(id));
  if (organizationIds.length === 0) return map;
  const { data, error } = await sb()
    .from('admin_org_profile')
    .select('*')
    .in('organization_id', organizationIds);
  if (error) throw new Error(`getProfilesMap failed: ${error.message}`);
  for (const r of data ?? []) {
    map.set((r as ProfileRow).organization_id, rowToProfile(r as ProfileRow));
  }
  return map;
}

export async function upsertProfile(
  organizationId: string,
  patch: AdminOrgProfilePatch,
): Promise<AdminOrgProfile> {
  const row = { organization_id: organizationId, ...patchToRow(patch) };
  const { data, error } = await sb()
    .from('admin_org_profile')
    .upsert(row, { onConflict: 'organization_id' })
    .select('*')
    .single();
  if (error) throw new Error(`upsertProfile failed: ${error.message}`);
  return rowToProfile(data as ProfileRow);
}
