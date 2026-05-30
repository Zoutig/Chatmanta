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
  type OrgSlug,
} from '@/lib/v0/server/active-org';
import { upsertProfile } from '@/lib/controlroom/server/profiles';
import { updateOnboardingItem } from '@/lib/controlroom/server/onboarding';
import { upsertPrivacy } from '@/lib/controlroom/server/privacy';
import { setErrorGroupStatus } from '@/lib/controlroom/server/errors';
import { setFeedbackStatus, deleteFeedback } from '@/lib/controlroom/server/feedback';
import { FEEDBACK_STATUSES, type FeedbackStatus } from '@/lib/controlroom/types';
import type { ErrorStatus } from '@/lib/observability/sink';
import {
  saveChatbotSettings,
  saveWidgetSettings,
  getOrgSettings,
} from '@/lib/v0/klantendashboard/server/settings';
import type {
  AdminOrgProfile,
  AdminOrgProfilePatch,
  OnboardingItem,
  OnboardingItemPatch,
  PrivacySettings,
  PrivacySettingsPatch,
} from '@/lib/controlroom/types';
import type { ChatbotSettings, WidgetSettings } from '@/lib/v0/klantendashboard/types';
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

// ── Feedback-tab: status van een klant-melding (admin_feedback) ──
// Geen org-slug nodig (de melding is op id); requireV0Auth() is de poort.
// De status wordt server-side tegen FEEDBACK_STATUSES gevalideerd; setFeedbackStatus
// schrijft een status_change-event voor de historie. revalidate() herrendert de
// hele /admindashboard-tree zodat lijst + detail meelopen.
export async function setFeedbackStatusAction(
  id: string,
  status: FeedbackStatus,
): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    if (!(FEEDBACK_STATUSES as readonly string[]).includes(status)) {
      fail('INPUT_INVALID', `ongeldige status: ${status}`);
    }
    await setFeedbackStatus(id, status);
    revalidate();
    return { id };
  });
}

export async function deleteFeedbackAction(id: string): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    await deleteFeedback(id);
    revalidate();
    return { id };
  });
}

// ───────────────────────── Bot- + widgetinstellingen (taak 1) ─────────────
// Admin bewerkt de bot/widget-config van een klant via de route-param-org i.p.v.
// de active-org cookie. We hergebruiken de bestaande save-backends (die nemen de
// orgSlug al expliciet) en revalideren naast /admindashboard óók /klantendashboard
// + /widget, zodat het klantendashboard van de org én de live widget/demo de
// wijziging meteen tonen. requireKnownOrgId valideert de slug vóór elke write.

const WIDGET_INSTALL_FRESHNESS_SEC = Number(process.env.WIDGET_INSTALL_FRESHNESS_SEC) || 604800;

export async function adminSaveChatbotSettingsAction(
  orgSlug: string,
  patch: Partial<ChatbotSettings>,
): Promise<ActionResult<{ chatbot: ChatbotSettings }>> {
  return actionTry(async () => {
    await requireV0Auth();
    requireKnownOrgId(orgSlug);
    const chatbot = await saveChatbotSettings(orgSlug as OrgSlug, patch);
    revalidate(orgSlug);
    revalidatePath('/klantendashboard', 'layout');
    revalidatePath('/widget', 'layout');
    return { chatbot };
  });
}

export async function adminSaveWidgetSettingsAction(
  orgSlug: string,
  patch: Partial<WidgetSettings>,
): Promise<ActionResult<{ widget: WidgetSettings }>> {
  return actionTry(async () => {
    await requireV0Auth();
    requireKnownOrgId(orgSlug);
    const widget = await saveWidgetSettings(orgSlug as OrgSlug, patch);
    revalidate(orgSlug);
    revalidatePath('/klantendashboard', 'layout');
    revalidatePath('/widget', 'layout');
    return { widget };
  });
}

export async function adminCheckWidgetInstallationAction(
  orgSlug: string,
): Promise<
  ActionResult<{
    isInstalled: boolean;
    lastSeenAt: string | null;
    installOrigin: string | null;
    lastCheckedAt: string;
  }>
> {
  return actionTry(async () => {
    await requireV0Auth();
    requireKnownOrgId(orgSlug);
    const slug = orgSlug as OrgSlug;
    const settings = await getOrgSettings(slug);
    const w = settings.widget;
    const seenMs = w.lastSeenAt ? Date.parse(w.lastSeenAt) : NaN;
    const installed =
      Number.isFinite(seenMs) && Date.now() - seenMs < WIDGET_INSTALL_FRESHNESS_SEC * 1000;
    const lastCheckedAt = new Date().toISOString();
    await saveWidgetSettings(slug, { isInstalled: installed, lastCheckedAt });
    revalidate(orgSlug);
    return {
      isInstalled: installed,
      lastSeenAt: w.lastSeenAt,
      installOrigin: w.installOrigin,
      lastCheckedAt,
    };
  });
}
