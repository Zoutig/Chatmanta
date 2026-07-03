'use server';

// V1 admin-overlay server actions — profiel, onboarding, privacy, notities.
//
// Auth: requireJorionAdmin() bovenaan élke action (defense-in-depth, ook als de
// layout-gate al is gepasseerd). Daarna getJorionAdminClient() voor de writes
// (service-role, bypast RLS op de admin_*-tabellen). orgId komt uit de action-
// args (admin is cross-org by design — geen membership-check) maar we valideren
// dat de org bestaat vóór elke write.

import { revalidatePath } from 'next/cache';
import { requireJorionAdmin } from '@/lib/auth';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { upsertProfile } from '@/lib/v1/admin/profile';
import { updateOnboardingItem } from '@/lib/v1/admin/onboarding';
import { upsertPrivacy } from '@/lib/v1/admin/privacy';
import type {
  AdminOrgProfilePatch,
  OnboardingItemPatch,
  PrivacySettingsPatch,
} from '@/lib/controlroom/types';

/** Haal admin-client op na admin-gate. Herbruikbaar patroon voor alle actions. */
async function gate(): Promise<Awaited<ReturnType<typeof getJorionAdminClient>>> {
  // requireJorionAdmin gooit AUTH_FORBIDDEN of NEXT_REDIRECT; callers vangen dat
  // zelf in de action-wrapper zodat de juiste ActionFail of redirect volgt.
  await requireJorionAdmin();
  return getJorionAdminClient();
}

/** Valideer dat een org met dit id bestaat. Gooit NOT_FOUND via fail(). */
async function assertOrgExists(
  admin: Awaited<ReturnType<typeof getJorionAdminClient>>,
  orgId: string,
): Promise<void> {
  const { data, error } = await admin
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(`assertOrgExists: ${error.message}`);
  if (!data) fail('NOT_FOUND', 'Organisatie niet gevonden.');
}

// ─────────────────────── Profiel ──────────────────────────

export async function updateProfileAction(
  orgId: string,
  patch: AdminOrgProfilePatch,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await gate();
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message, code: e.code } satisfies ActionFail;
    throw e;
  }
  return actionTry(async () => {
    if (!orgId) fail('INPUT_INVALID', 'Geen organisatie-id opgegeven.');
    await assertOrgExists(admin, orgId);
    await upsertProfile(admin, orgId, patch);
    revalidatePath(`/v1/admin/organizations/${orgId}`);
    return {};
  });
}

// ─────────────────────── Notities ─────────────────────────

/** Alleen notes — apart action zodat de NotesEditor niet de hele profiel-patch nodig heeft. */
export async function updateNotesAction(
  orgId: string,
  notes: string | null,
): Promise<ActionResult> {
  return updateProfileAction(orgId, { notes });
}

// ─────────────────────── Onboarding ───────────────────────

export async function updateOnboardingItemAction(
  orgId: string,
  itemId: string,
  patch: OnboardingItemPatch,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await gate();
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message, code: e.code } satisfies ActionFail;
    throw e;
  }
  return actionTry(async () => {
    if (!orgId || !itemId) fail('INPUT_INVALID', 'Ontbrekende org-id of item-id.');
    await assertOrgExists(admin, orgId);
    await updateOnboardingItem(admin, itemId, orgId, patch);
    revalidatePath(`/v1/admin/organizations/${orgId}`);
    return {};
  });
}

// ─────────────────────── Privacy ──────────────────────────

export async function updatePrivacyAction(
  orgId: string,
  patch: PrivacySettingsPatch,
): Promise<ActionResult> {
  let admin;
  try {
    admin = await gate();
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message, code: e.code } satisfies ActionFail;
    throw e;
  }
  return actionTry(async () => {
    if (!orgId) fail('INPUT_INVALID', 'Geen organisatie-id opgegeven.');
    await assertOrgExists(admin, orgId);
    await upsertPrivacy(admin, orgId, patch);
    revalidatePath(`/v1/admin/organizations/${orgId}`);
    return {};
  });
}
