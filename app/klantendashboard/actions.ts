'use server';

// V0 klantendashboard — server actions voor settings-persistentie.
//
// Patroon: actionTry + actieve org server-side resolven (geen slug uit client
// payload — voorkomt cross-org tampering, defense-in-depth bovenop V0's gedeelde
// password-gate). Na succesvolle write revalidatePath('/klantendashboard', 'layout')
// + bij widget-changes ook '/widget' zodat de demo-pagina meteen herrendert.

import { revalidatePath } from 'next/cache';
import { actionTry, type ActionResult } from '@/lib/errors/action';
import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import {
  saveWidgetSettings,
  saveChatbotSettings,
  upsertQAItem,
  deleteQAItem,
  setQAActive,
} from '@/lib/v0/klantendashboard/server/settings';
import type {
  ChatbotSettings,
  ManualQA,
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
