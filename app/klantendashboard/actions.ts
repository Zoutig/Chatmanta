'use server';

// V0 klantendashboard — server actions voor settings-persistentie.
//
// Patroon: actionTry + actieve org server-side resolven (geen slug uit client
// payload — voorkomt cross-org tampering, defense-in-depth bovenop V0's gedeelde
// password-gate). Na succesvolle write revalidatePath('/klantendashboard', 'layout')
// + bij widget-changes ook '/widget' zodat de demo-pagina meteen herrendert.

import { revalidatePath } from 'next/cache';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { requireV0Auth } from '@/app/actions/_auth';
import { checkMutationLimit } from '@/lib/v0/server/rate-limit';
import {
  createFeedback,
  uploadAttachment,
  setFeedbackAttachment,
  addFeedbackEvent,
} from '@/lib/controlroom/server/feedback';
import { parseFeedbackForm, assertValidAttachment } from '@/lib/controlroom/feedback-validate';
import {
  saveWidgetSettings,
  getOrgSettings,
  saveChatbotSettings,
  saveTopQuestionsConfig,
  upsertQAItem,
  deleteQAItem,
  setQAActive,
} from '@/lib/v0/klantendashboard/server/settings';
import type {
  ChatbotSettings,
  ManualQA,
  TopQuestionsConfig,
  WidgetSettings,
} from '@/lib/v0/klantendashboard/types';

// ---------------------------------------------------------------------------
// Widget-settings
// ---------------------------------------------------------------------------
export async function saveWidgetSettingsAction(
  patch: Partial<WidgetSettings>,
): Promise<ActionResult<{ widget: WidgetSettings }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const widget = await saveWidgetSettings(activeOrg.slug, patch);
    revalidatePath('/klantendashboard', 'layout');
    // 'layout'-kind invalideert /widget én alle nested [slug]/[page] segmenten.
    // Zonder die kind blijven de generateStaticParams-prerendered demo-pages
    // hangen op de oude kleuren/titel — saved widget-config werd dan pas
    // zichtbaar na een rebuild of cache-TTL.
    revalidatePath('/widget', 'layout');
    return { widget };
  });
}

// Installatie-detectie: leest de echte heartbeat-status (lastSeenAt) i.p.v. een
// mock-toggle. installed = ping gezien binnen het freshness-venster. Persisteert
// de herberekende isInstalled + lastCheckedAt zodat de status niet eeuwig "Ja"
// blijft als de widget weken niet is gezien.
const WIDGET_INSTALL_FRESHNESS_SEC = Number(process.env.WIDGET_INSTALL_FRESHNESS_SEC) || 604800;

export async function checkWidgetInstallationAction(): Promise<
  ActionResult<{
    isInstalled: boolean;
    lastSeenAt: string | null;
    installOrigin: string | null;
    lastCheckedAt: string;
  }>
> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const settings = await getOrgSettings(activeOrg.slug);
    const w = settings.widget;
    const seenMs = w.lastSeenAt ? Date.parse(w.lastSeenAt) : NaN;
    const installed =
      Number.isFinite(seenMs) && Date.now() - seenMs < WIDGET_INSTALL_FRESHNESS_SEC * 1000;
    const lastCheckedAt = new Date().toISOString();
    await saveWidgetSettings(activeOrg.slug, { isInstalled: installed, lastCheckedAt });
    revalidatePath('/klantendashboard/widget', 'page');
    return {
      isInstalled: installed,
      lastSeenAt: w.lastSeenAt,
      installOrigin: w.installOrigin,
      lastCheckedAt,
    };
  });
}

// ---------------------------------------------------------------------------
// Chatbot-instellingen
// ---------------------------------------------------------------------------
export async function saveChatbotSettingsAction(
  patch: Partial<ChatbotSettings>,
): Promise<ActionResult<{ chatbot: ChatbotSettings }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const chatbot = await saveChatbotSettings(activeOrg.slug, patch);
    revalidatePath('/klantendashboard', 'layout');
    // chatbot-settings beïnvloeden het hele /widget demo-platform: starter-
    // questions, welcomeMessage, chatbotName en (via build-chatbot-overrides
    // → runRagQueryStreaming) tone, length, system-prompt overrides. 'layout'-
    // kind invalideert nested [slug]/[page] segmenten zodat saved settings
    // direct zichtbaar zijn.
    revalidatePath('/widget', 'layout');
    return { chatbot };
  });
}

// ---------------------------------------------------------------------------
// Manual Q&A
// ---------------------------------------------------------------------------
export async function upsertQAItemAction(
  item: ManualQA,
): Promise<ActionResult<{ qa: ManualQA[] }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const qa = await upsertQAItem(activeOrg.slug, item);
    revalidatePath('/klantendashboard', 'layout');
    return { qa };
  });
}

export async function deleteQAItemAction(
  id: string,
): Promise<ActionResult<{ qa: ManualQA[] }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const qa = await deleteQAItem(activeOrg.slug, id);
    revalidatePath('/klantendashboard', 'layout');
    return { qa };
  });
}

export async function setQAActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ qa: ManualQA[] }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const qa = await setQAActive(activeOrg.slug, id, active);
    revalidatePath('/klantendashboard', 'layout');
    return { qa };
  });
}

// ---------------------------------------------------------------------------
// Top-vragen drempel
// ---------------------------------------------------------------------------
export async function saveTopQuestionsAction(
  config: TopQuestionsConfig,
): Promise<ActionResult<{ topQuestions: TopQuestionsConfig }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const topQuestions = await saveTopQuestionsConfig(activeOrg.slug, config);
    // Revalidatie van /klantendashboard layout dekt zowel /instellingen
    // (zelf-refresh na save) als /gesprekken (de drempel-toepassing).
    revalidatePath('/klantendashboard', 'layout');
    return { topQuestions };
  });
}

// ---------------------------------------------------------------------------
// Maak Q&A vanaf top-questions-tab
// ---------------------------------------------------------------------------
export async function addQAFromTopQuestionAction(
  question: string,
  answer: string,
  category?: string,
): Promise<ActionResult<{ qa: ManualQA[] }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const item: ManualQA = {
      id: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      question: question.trim(),
      answer: answer.trim(),
      category: category?.trim() || undefined,
      active: true,
      updatedAt: new Date().toISOString(),
    };
    const qa = await upsertQAItem(activeOrg.slug, item);
    revalidatePath('/klantendashboard', 'layout');
    return { qa };
  });
}

// ---------------------------------------------------------------------------
// Feedback / meldingen (migratie 0043). De klant dient een melding in; de
// operator beheert hem in het Admin Dashboard. Defense-in-depth: requireV0Auth
// + mutation-rate-limit + org server-side uit de cookie (nooit client-payload).
// De bijlage wordt server-side gevalideerd (type/size) vóór upload.
// ---------------------------------------------------------------------------
export async function submitFeedbackAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    const activeOrg = await getActiveOrgFromCookies();
    const parsed = parseFeedbackForm(formData);

    // Bijlage: valideer vóór insert zodat een ongeldig bestand de hele submit
    // weigert (geen melding-met-kapotte-bijlage).
    const raw = formData.get('attachment');
    const file = raw instanceof File && raw.size > 0 ? raw : null;
    if (file) assertValidAttachment(file);

    const item = await createFeedback({
      organizationId: activeOrg.id,
      source: 'klantendashboard',
      type: parsed.type,
      urgency: parsed.urgency,
      description: parsed.description,
      submitterName: parsed.submitterName,
      submitterEmail: parsed.submitterEmail,
      chatId: parsed.chatId,
      question: parsed.question,
      privacyAcceptedAt: parsed.privacyAccepted ? new Date().toISOString() : null,
    });

    if (file) {
      // Soft-fail: de melding is al opgeslagen. Een mislukte upload (netwerk)
      // mag de submit niet alsnog laten falen — log en ga door.
      try {
        const { path, name } = await uploadAttachment(activeOrg.id, item.id, file);
        await setFeedbackAttachment(item.id, path, name);
      } catch (e) {
        console.error('[submitFeedbackAction] bijlage-upload faalde', (e as Error).message);
        // Maak het zichtbaar voor de operator: de klant voegde een bijlage toe
        // die niet kon worden opgeslagen. De melding zelf is wél bewaard.
        await addFeedbackEvent(item.id, {
          kind: 'internal_note',
          author: 'systeem',
          body: 'Bijlage-upload mislukt — de klant voegde een bestand toe dat niet kon worden opgeslagen.',
        }).catch(() => {});
      }
    }

    // Laat de operator-inbox (Admin Dashboard) de nieuwe melding meteen zien.
    revalidatePath('/admindashboard', 'layout');
    return { id: item.id };
  });
}
