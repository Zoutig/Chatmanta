'use server';

// Admin Dashboard (Admin Dashboard V0) — server actions voor de admin-overlay.
//
// Auth: requireV0Auth() vóór elke service-role-call (defense-in-depth boven
// proxy.ts), exact zoals app/actions/commandcenter.ts. Daarnaast valideren we
// elke org-slug tegen KNOWN_ORGS vóór een write — de overlay-tabellen hebben
// geen FK naar organizations, dus dit is de poort die voorkomt dat een
// willekeurige organization_id wordt aangemaakt. Enum-velden worden server-side
// door de DB CHECK-constraints (migration 0038) afgedwongen.

import { revalidatePath } from 'next/cache';
import {
  KNOWN_ORGS,
  resolveOrgIdFromSlug,
} from '@/lib/v0/server/active-org';
import { upsertProfile } from '@/lib/controlroom/server/profiles';
import { updateOnboardingItem } from '@/lib/controlroom/server/onboarding';
import { upsertPrivacy } from '@/lib/controlroom/server/privacy';
import { setErrorGroupStatus } from '@/lib/controlroom/server/errors';
import type { ErrorStatus } from '@/lib/observability/sink';
import type {
  AdminOrgProfile,
  AdminOrgProfilePatch,
  OnboardingItem,
  OnboardingItemPatch,
  PrivacySettings,
  PrivacySettingsPatch,
} from '@/lib/controlroom/types';
import { requireV0Auth } from './_auth';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';

/** Valideer een org-slug tegen KNOWN_ORGS en geef de stabiele UUID terug.
 *  Onbekende slug → NOT_FOUND (geen write naar een vreemde org-id). */
function requireKnownOrgId(slug: string): string {
  if (!(slug in KNOWN_ORGS)) {
    fail('NOT_FOUND', `unknown org slug: ${slug}`);
  }
  const id = resolveOrgIdFromSlug(slug);
  if (!id) fail('NOT_FOUND', `unresolvable org slug: ${slug}`);
  return id;
}

function revalidate(slug?: string) {
  // 'layout' herrendert de hele /admindashboard-segmenttree (overview, lijst,
  // detail-tabs) zodat een statuswijziging overal meteen zichtbaar is.
  revalidatePath('/admindashboard', 'layout');
  if (slug) revalidatePath(`/admindashboard/klanten/${slug}`);
}

export async function updateProfileAction(
  orgSlug: string,
  patch: AdminOrgProfilePatch,
): Promise<ActionResult<{ profile: AdminOrgProfile }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const profile = await upsertProfile(orgId, patch);
    revalidate(orgSlug);
    return { profile };
  });
}

export async function updateOnboardingItemAction(
  orgSlug: string,
  itemId: string,
  patch: OnboardingItemPatch,
): Promise<ActionResult<{ item: OnboardingItem }>> {
  return actionTry(async () => {
    await requireV0Auth();
    requireKnownOrgId(orgSlug);
    const item = await updateOnboardingItem(itemId, patch);
    revalidate(orgSlug);
    return { item };
  });
}

export async function updatePrivacyAction(
  orgSlug: string,
  patch: PrivacySettingsPatch,
): Promise<ActionResult<{ privacy: PrivacySettings }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const privacy = await upsertPrivacy(orgId, patch);
    revalidate(orgSlug);
    return { privacy };
  });
}

// ── Issues-tab: status van een gelogde fout-groep (admin_error_groups) ──
// Geen org-slug nodig (de groep is op id); requireV0Auth() is de poort. revalidate()
// herrendert de hele /admindashboard-tree zodat de Issues-lijst + detail meelopen.
async function setErrorStatus(id: string, status: ErrorStatus): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    await setErrorGroupStatus(id, status);
    revalidate();
    return { id };
  });
}

// 'use server' vereist dat ELKE export een async function is — vandaar async
// wrappers (geen plain `export function` die een promise teruggeeft; die wordt
// door de server-action-transform gedropt → "export not found" op de client).
export async function resolveErrorGroupAction(id: string): Promise<ActionResult<{ id: string }>> {
  return setErrorStatus(id, 'resolved');
}

export async function ignoreErrorGroupAction(id: string): Promise<ActionResult<{ id: string }>> {
  return setErrorStatus(id, 'ignored');
}

export async function reopenErrorGroupAction(id: string): Promise<ActionResult<{ id: string }>> {
  return setErrorStatus(id, 'open');
}
