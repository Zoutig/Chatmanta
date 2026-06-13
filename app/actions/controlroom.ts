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
  resolveOrgSlugFromId,
  type OrgSlug,
} from '@/lib/v0/server/active-org';
import { upsertProfile } from '@/lib/controlroom/server/profiles';
import { updateOnboardingItem } from '@/lib/controlroom/server/onboarding';
import { upsertPrivacy } from '@/lib/controlroom/server/privacy';
import { setErrorGroupStatus } from '@/lib/controlroom/server/errors';
import {
  setFeedbackStatus,
  setFeedbackPriority,
  addFeedbackEvent,
  deleteFeedback,
  getFeedback,
} from '@/lib/controlroom/server/feedback';
import { buildFeedbackReplyEmail, isValidFeedbackEmail } from '@/lib/notifications/feedback-email';
import { sendEmail } from '@/lib/notifications/email';
import {
  FEEDBACK_STATUSES,
  FEEDBACK_PRIORITIES,
  type FeedbackStatus,
  type FeedbackPriority,
} from '@/lib/controlroom/types';
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
import {
  createQuiz,
  getActiveQuizForOrg,
  getQuestion,
  getQuiz,
  insertQuestions,
  listQuestions,
  setQuizStatus,
  softDeleteQuestion,
  updateQuestion,
  updateQuizCounts,
} from '@/lib/controlroom/server/quiz';
import { analyzeKnowledgeBase, hasAnalyzableContent } from '@/lib/controlroom/server/quiz-analysis';
import {
  QUIZ_ANALYSE_MODELS,
  type QuizAnalyseModel,
  type QuizItem,
  type QuizQuestion,
  type QuizQuestionInput,
  type QuizQuestionPatch,
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

/** Operator-prioriteit (Fase 2). Lege string = wissen (null). De wijziging wordt
 *  als internal_note in de historie gelogd door setFeedbackPriority. */
export async function setFeedbackPriorityAction(
  id: string,
  priority: FeedbackPriority | '',
): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const next: FeedbackPriority | null = priority === '' ? null : priority;
    if (next !== null && !(FEEDBACK_PRIORITIES as readonly string[]).includes(next)) {
      fail('INPUT_INVALID', `ongeldige prioriteit: ${priority}`);
    }
    await setFeedbackPriority(id, next);
    revalidate();
    return { id };
  });
}

/** Operator-notitie of -reactie (Fase 2) — append-only event in de historie. */
export async function addFeedbackNoteAction(
  id: string,
  kind: 'comment' | 'internal_note',
  body: string,
): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    if (kind !== 'comment' && kind !== 'internal_note') {
      fail('INPUT_INVALID', `ongeldig notitie-type: ${kind}`);
    }
    const trimmed = (body ?? '').trim();
    if (trimmed.length === 0) fail('INPUT_INVALID', 'Notitie mag niet leeg zijn.');
    if (trimmed.length > 4000) fail('INPUT_INVALID', 'Notitie is te lang (max 4000 tekens).');
    await addFeedbackEvent(id, { kind, body: trimmed, author: 'operator' });
    revalidate();
    return { id };
  });
}

/** Stuur een reactie per e-mail naar de indiener van een melding (Niels' item 3).
 *  Verstuurt UITSLUITEND naar het opgegeven indiener-adres en alleen als de
 *  privacyverklaring is geaccepteerd (AVG-grondslag). De reactie wordt als
 *  comment-event gelogd (audit-spoor) en het verzendresultaat wordt teruggegeven
 *  zodat de operator ziet of de mail daadwerkelijk vertrok (geen stil-slikken). */
export async function sendFeedbackReplyAction(
  id: string,
  replyText: string,
): Promise<ActionResult<{ id: string; sent: boolean; detail: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const trimmed = (replyText ?? '').trim();
    if (trimmed.length === 0) fail('INPUT_INVALID', 'De reactie mag niet leeg zijn.');
    if (trimmed.length > 4000) fail('INPUT_INVALID', 'De reactie is te lang (max 4000 tekens).');

    const item = await getFeedback(id);
    if (!item) fail('NOT_FOUND', 'Melding niet gevonden.');
    if (!isValidFeedbackEmail(item.submitterEmail)) {
      fail('INPUT_INVALID', 'Deze melding heeft geen geldig e-mailadres om op te reageren.');
    }
    if (!item.privacyAcceptedAt) {
      fail('INPUT_INVALID', 'De indiener heeft geen toestemming gegeven om gecontacteerd te worden.');
    }

    const slug = resolveOrgSlugFromId(item.organizationId);
    const orgName = slug ? KNOWN_ORGS[slug].name : item.organizationId;
    const email = buildFeedbackReplyEmail(item, trimmed, { orgName });
    const result = await sendEmail({
      to: item.submitterEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    // Audit-spoor: leg vast wát er is gebeurd — mét de werkelijke verzendstatus
    // (geen vaste "gemaild"-tekst die ook bij een mislukte/overgeslagen verzending
    // verschijnt). Best-effort: een falende audit-insert mag een geslaagde
    // verzending niet maskeren (anders → action-error → operator-retry → dubbele
    // mail). Codex-review golf-2 #4.
    const auditStatus = result.ok
      ? `verzonden naar ${item.submitterEmail}`
      : result.skipped
        ? `NIET verzonden (geen mailconfiguratie) — bedoeld voor ${item.submitterEmail}`
        : `NIET verzonden (${result.error}) — bedoeld voor ${item.submitterEmail}`;
    let audited = true;
    try {
      await addFeedbackEvent(id, {
        kind: 'comment',
        body: `Reactie ${auditStatus}:\n${trimmed}`.slice(0, 4000),
        author: 'operator',
      });
    } catch (err) {
      audited = false;
      console.warn('[feedback reply] audit-event faalde (verzending niet beïnvloed):', err);
    }
    revalidate();

    if (result.ok) {
      return { id, sent: true, detail: 'Reactie verzonden naar de klant.' };
    }
    // Alleen claimen dat het in de historie staat als de audit-insert ook lukte.
    const histNote = audited ? ' De reactie is wel in de historie vastgelegd.' : '';
    if (result.skipped) {
      return { id, sent: false, detail: `E-mail niet verzonden: geen mailconfiguratie (RESEND_API_KEY ontbreekt).${histNote}` };
    }
    return { id, sent: false, detail: `E-mail niet verzonden: ${result.error}.${histNote}` };
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

// ───────────────────────── Kennisbank-Quiz (M3) ─────────────────────────
// Operator triggert de AI-analyse, beoordeelt de gegenereerde vragen en
// activeert de quiz. De analyse draait SYNCHROON binnen de trigger-action;
// maxDuration=120 op de klantdetail-route dekt de ~15-60s gpt-4o(-mini)-call.
// Org uit de route-param (requireKnownOrgId); alle DB-toegang via quiz.ts.

// Her-genereren mag vanuit deze statussen; actief/voltooid = eenmalig. 'generating'
// staat erbij zodat een afgebroken synchrone run (timeout/navigatie) herstelbaar is.
const QUIZ_RETRIGGERABLE = new Set(['generating', 'concept', 'leeg', 'mislukt']);

/** Object-level access: laad een quiz en verifieer dat hij bij deze org hoort. */
async function loadQuizForOrg(quizId: string, orgId: string): Promise<QuizItem> {
  const quiz = await getQuiz(quizId);
  if (!quiz || quiz.organizationId !== orgId) fail('NOT_FOUND', 'Quiz niet gevonden voor deze klant.');
  return quiz;
}

/** Laad een vraag, verifieer org-eigendom én dat de bijbehorende quiz nog
 *  'concept' is (vragen bewerken/toevoegen mag alleen vóór activatie). */
async function requireConceptQuestion(questionId: string, orgId: string): Promise<QuizQuestion> {
  const question = await getQuestion(questionId);
  if (!question || question.organizationId !== orgId) fail('NOT_FOUND', 'Vraag niet gevonden voor deze klant.');
  const quiz = await loadQuizForOrg(question.quizId, orgId);
  if (quiz.status !== 'concept') {
    fail('INPUT_INVALID', `Vragen kunnen alleen bewerkt worden in een concept-quiz (status: ${quiz.status}).`);
  }
  return question;
}

export async function triggerQuizAnalysisAction(
  orgSlug: string,
  model: QuizAnalyseModel,
): Promise<ActionResult<{ quizId: string; status: string; questionCount: number }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    if (!(QUIZ_ANALYSE_MODELS as readonly string[]).includes(model)) {
      fail('INPUT_INVALID', `onbekend model: ${model}`);
    }
    if (!(await hasAnalyzableContent(orgId))) {
      fail('INPUT_INVALID', 'Kennisbank is leeg. Voeg eerst minimaal één kennisbron toe (document of website-scrape) voordat je de analyse start.');
    }
    // Re-trigger: annuleer een herbruikbare oude quiz; blokkeer op actief/voltooid.
    const existing = await getActiveQuizForOrg(orgId);
    if (existing) {
      if (!QUIZ_RETRIGGERABLE.has(existing.status)) {
        fail('INPUT_INVALID', `Er is al een ${existing.status} quiz voor deze klant — een actieve of voltooide quiz kan niet opnieuw gegenereerd worden.`);
      }
      await setQuizStatus(existing.id, 'geannuleerd');
    }
    const quiz = await createQuiz({ organizationId: orgId, analyseModel: model });
    const summary = await analyzeKnowledgeBase({ quizId: quiz.id, organizationId: orgId, model });
    revalidate(orgSlug);
    return { quizId: quiz.id, status: summary.status, questionCount: summary.questionCount };
  });
}

export async function setQuizQuestionApprovedAction(
  orgSlug: string,
  questionId: string,
  approved: boolean,
): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    await requireConceptQuestion(questionId, orgId);
    await updateQuestion(questionId, { goedgekeurd: approved });
    revalidate(orgSlug);
    return { id: questionId };
  });
}

export async function updateQuizQuestionAction(
  orgSlug: string,
  questionId: string,
  patch: QuizQuestionPatch,
): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    await requireConceptQuestion(questionId, orgId);
    if (patch.vraag !== undefined) {
      const v = patch.vraag.trim();
      if (v.length < 1 || v.length > 2000) fail('INPUT_INVALID', 'Vraag moet tussen 1 en 2000 tekens zijn.');
    }
    await updateQuestion(questionId, patch);
    revalidate(orgSlug);
    return { id: questionId };
  });
}

export async function deleteQuizQuestionAction(
  orgSlug: string,
  quizId: string,
  questionId: string,
): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    await requireConceptQuestion(questionId, orgId);
    await softDeleteQuestion(quizId, questionId);
    revalidate(orgSlug);
    return { id: questionId };
  });
}

export async function addQuizQuestionAction(
  orgSlug: string,
  quizId: string,
  input: QuizQuestionInput,
): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const quiz = await loadQuizForOrg(quizId, orgId);
    if (quiz.status !== 'concept') fail('INPUT_INVALID', `Vragen toevoegen kan alleen in een concept-quiz (status: ${quiz.status}).`);
    const vraag = (input.vraag ?? '').trim();
    if (vraag.length < 1 || vraag.length > 2000) fail('INPUT_INVALID', 'Vraag moet tussen 1 en 2000 tekens zijn.');
    const created = await insertQuestions(quizId, orgId, [
      { ...input, vraag, bron: 'niels', goedgekeurd: true },
    ]);
    revalidate(orgSlug);
    return { id: created[0]?.id ?? '' };
  });
}

export async function activateQuizAction(
  orgSlug: string,
  quizId: string,
): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const quiz = await loadQuizForOrg(quizId, orgId);
    if (quiz.status !== 'concept') {
      fail('INPUT_INVALID', `Alleen een concept-quiz kan geactiveerd worden (huidige status: ${quiz.status}).`);
    }
    const active = await listQuestions(quizId, { activeOnly: true });
    if (active.length === 0) {
      fail('INPUT_INVALID', 'Keur eerst minimaal één vraag goed voordat je de quiz activeert.');
    }
    // question_count weerspiegelt vanaf activatie de actieve (goedgekeurde) set.
    await updateQuizCounts(quizId, { questionCount: active.length });
    await setQuizStatus(quizId, 'actief');
    revalidate(orgSlug);
    revalidatePath('/klantendashboard', 'layout'); // klant-banner (M4) verschijnt
    return { id: quizId };
  });
}

export async function cancelQuizAction(
  orgSlug: string,
  quizId: string,
): Promise<ActionResult<{ id: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const orgId = requireKnownOrgId(orgSlug);
    const quiz = await loadQuizForOrg(quizId, orgId);
    if (quiz.status === 'voltooid') {
      fail('INPUT_INVALID', 'Een voltooide quiz kan niet meer geannuleerd worden (eenmalig per klant).');
    }
    await setQuizStatus(quizId, 'geannuleerd');
    revalidate(orgSlug);
    return { id: quizId };
  });
}
