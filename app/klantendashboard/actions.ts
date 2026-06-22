'use server';

// V0 klantendashboard — server actions voor settings-persistentie.
//
// Patroon: actionTry + actieve org server-side resolven (geen slug uit client
// payload — voorkomt cross-org tampering, defense-in-depth bovenop V0's gedeelde
// password-gate). Na succesvolle write revalidatePath('/klantendashboard', 'layout')
// + bij widget-changes ook '/widget' zodat de demo-pagina meteen herrendert.

import { revalidatePath } from 'next/cache';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';
import { getActiveOrgFromCookies, KNOWN_ORGS, type OrgSlug } from '@/lib/v0/server/active-org';
import { getSystemJobClient } from '@/lib/supabase/admin';
import { reconstructFromChunks } from '@/lib/v0/server/reconstruct-chunks';
import { requireV0Auth } from '@/app/actions/_auth';
import { checkMutationLimit } from '@/lib/v0/server/rate-limit';
import {
  createAnswer,
  getActiveQuizForOrg,
  getQuestion,
  listAnswers,
  listQuestions,
  QuizAnswerExistsError,
  setAnswerIngestedDoc,
  setQuizStatus,
  updateQuizCounts,
} from '@/lib/controlroom/server/quiz';
import { ingestText } from '@/lib/v0/server/rag';
import { redactPii } from '@/lib/observability/redact';
import {
  createFeedback,
  uploadAttachment,
  setFeedbackAttachment,
  addFeedbackEvent,
  uploadWidgetPreview,
} from '@/lib/controlroom/server/feedback';
import { screenshotSite } from '@/lib/v0/crawler/firecrawl';
import { getPrimaryWebsiteRootUrl } from '@/lib/v0/server/crawler';
import {
  generateStarterQuestions,
  generateFallbackMessage,
  extractContactInfo,
  type ExtractedContact,
} from '@/lib/v0/klantendashboard/server/generate';
import { getKlantFaqSnapshot } from '@/lib/v0/klantendashboard/server/faq-klant';
import { getMockAccountInfo } from '@/lib/v0/klantendashboard/mock/account';
import { parseFeedbackForm, assertValidAttachment } from '@/lib/controlroom/feedback-validate';
import { notifyNewFeedback } from '@/lib/notifications/feedback-notify';
import {
  saveWidgetSettings,
  getOrgSettings,
  saveChatbotSettings,
  saveTopQuestionsConfig,
  saveAccountInfo,
  setSetupStepSkipped,
  upsertQAItem,
  deleteQAItem,
  setQAActive,
  getWidgetPreview,
  saveWidgetPreview,
  saveContactRequestsSettings,
} from '@/lib/v0/klantendashboard/server/settings';
import type {
  AccountOverrides,
  ChatbotSettings,
  ContactRequestsSettings,
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
// Contactverzoeken-instelling (migr 0053) — per-org toggle + optioneel
// meldingsadres. Eigen 1-koloms-upsert (saveContactRequestsSettings), los van de
// chatbot-settings-form: aanzetten clobbert geen gelijktijdige widget/chatbot/qa-
// write. Org server-side uit de cookie (nooit client-payload). 'layout'-revalidatie
// dekt zowel de Instellingen-pagina als de sidebar-NavItem/badge.
// ---------------------------------------------------------------------------
export async function saveContactRequestsSettingsAction(
  patch: Partial<ContactRequestsSettings>,
): Promise<ActionResult<{ contactRequests: ContactRequestsSettings }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const contactRequests = await saveContactRequestsSettings(activeOrg.slug, patch);
    revalidatePath('/klantendashboard', 'layout');
    return { contactRequests };
  });
}

// ---------------------------------------------------------------------------
// Account-gegevens (Niels item 8) — klant-aanpasbare display-velden.
// ---------------------------------------------------------------------------
export async function saveAccountInfoAction(
  patch: AccountOverrides,
): Promise<ActionResult<{ account: AccountOverrides }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const account = await saveAccountInfo(activeOrg.slug, patch);
    revalidatePath('/klantendashboard/account', 'page');
    return { account };
  });
}

// ---------------------------------------------------------------------------
// Widget-preview screenshot (M6) — de "Preview Chatbot"-tab toont de widget over
// een screenshot van de échte klant-site als sfeer-backdrop. De capture is een
// BILLABLE Firecrawl-call (~1 credit), dus:
//   - we doen 'm AUTOMATISCH bij de éérste preview-open en CACHEN het resultaat;
//     een al-gecachede preview → meteen terug ZONDER Firecrawl-call (kosten-rem);
//   - mutation-rate-limit erop (de eerste capture is duur/abuse-gevoelig);
//   - elke fout → { url: null } → de UI valt terug op een mockup-backdrop.
// Org server-side uit de cookie (nooit client-payload).
// ---------------------------------------------------------------------------

/** Resolveer de website-URL van de actieve org. De websiteUrl is (nog) geen
 *  klant-aanpasbaar account-override-veld (AccountOverrides dekt alleen
 *  companyName/contactPerson/email), dus de mock-profielen zijn de bron-van-
 *  waarheid. '' (bv. demo-nieuw) → null = "geen screenshot, val terug op mockup". */
async function resolveOrgWebsiteUrl(slug: OrgSlug): Promise<string | null> {
  // 1. De échte gecrawlde root-URL is de site die de klant scrapte — exact wat de
  //    Preview-backdrop hoort te tonen ("screenshot van de gescrapte website"). We
  //    proberen die EERST, want de mock-`websiteUrl` van de demo-orgs is vaak een
  //    fictief domein (dakwerkendeboer.nl, fysioplus-utrecht.nl, …) dat niet bestaat
  //    → Firecrawl-screenshot faalt → mockup. Een gecrawlde root-URL bestaat
  //    gegarandeerd (er kwamen pagina's uit).
  const crawled = await getPrimaryWebsiteRootUrl(KNOWN_ORGS[slug].id);
  if (crawled) return crawled;
  // 2. Terugval op het mock-profiel (demo-orgs zonder echte crawl). '' (bv.
  //    demo-nieuw) → null = "geen screenshot, val terug op mockup".
  const mock = getMockAccountInfo(slug, { conversationsThisMonth: 0, documentsCount: 0 });
  const mockUrl = (mock.websiteUrl ?? '').trim();
  return mockUrl.length > 0 ? mockUrl : null;
}

export async function getWidgetPreviewAction(): Promise<ActionResult<{ url: string | null }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const cached = await getWidgetPreview(activeOrg.slug);
    return { url: cached?.url ?? null };
  });
}

export async function captureWidgetPreviewAction(): Promise<ActionResult<{ url: string | null }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();

    // (a) Kosten-rem: een al-gecachede preview → meteen terug, GEEN Firecrawl-call.
    const cached = await getWidgetPreview(activeOrg.slug);
    if (cached) return { url: cached.url };

    // Pas hier de rate-limit-poort: alleen het pad dat écht een billable capture
    // doet wordt begrensd (cache-hits hierboven blijven gratis/onbeperkt).
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    // (b) Geen website-URL (bv. demo-nieuw) → geen screenshot; UI → mockup.
    const url = await resolveOrgWebsiteUrl(activeOrg.slug);
    if (!url) return { url: null };

    // (c) Billable best-effort capture. screenshotSite gooit nooit → null bij fout.
    const bytes = await screenshotSite(url);
    if (!bytes) return { url: null };

    // Upload + cache. Een upload/save-fout mag de flow niet 500'en — de capture
    // is sfeer, geen kritiek pad; de UI valt terug op de mockup.
    try {
      const { url: previewUrl } = await uploadWidgetPreview(activeOrg.id, bytes);
      await saveWidgetPreview(activeOrg.slug, { url: previewUrl, capturedAt: new Date().toISOString() });
      revalidatePath('/klantendashboard/widget', 'page');
      return { url: previewUrl };
    } catch (e) {
      console.error('[captureWidgetPreview] upload/save faalde', (e as Error).message);
      return { url: null };
    }
  });
}

// ---------------------------------------------------------------------------
// Setup-checklist "overslaan" (item 2) — markeer een afgeleide stap als gedaan.
// ---------------------------------------------------------------------------
export async function setSetupStepSkippedAction(
  stepId: string,
  skipped: boolean = true,
): Promise<ActionResult<{ skips: string[] }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const skips = await setSetupStepSkipped(activeOrg.slug, stepId, skipped);
    revalidatePath('/klantendashboard', 'layout');
    return { skips };
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

    // Fase 3: e-mailnotificatie (operator + evt. indiener). Fail-safe en gated op
    // RESEND_API_KEY — notifyNewFeedback gooit nooit, dus de submit kan niet
    // alsnog falen door een mailprobleem.
    await notifyNewFeedback(item, KNOWN_ORGS[activeOrg.slug].name);

    // Laat de operator-inbox (Admin Dashboard) de nieuwe melding meteen zien.
    revalidatePath('/admindashboard', 'layout');
    return { id: item.id };
  });
}

// ---------------------------------------------------------------------------
// Kennisbank-Quiz (M4) — klant beantwoordt of slaat een vraag over. Het antwoord
// gaat PII-geredacteerd + lengte-gecapt de kennisbank in als nieuwe bron
// (source 'v0_local' + metadata-provenance origin:'quiz'). Org server-side uit
// de cookie (nooit client-payload). Bij de laatste vraag → quiz 'voltooid'.
// ---------------------------------------------------------------------------
const QUIZ_ANSWER_MAX = 2000;

export async function submitQuizAnswerAction(
  questionId: string,
  payload: { antwoord?: string | null; meerkeuzeOptie?: string | null; andersTekst?: string | null; skip?: boolean },
): Promise<ActionResult<{ done: boolean; answered: number; total: number }>> {
  return actionTry(async () => {
    // Defense-in-depth + abuse/cost-rem: deze action ingest in de publieke KB +
    // doet een embed-call, dus zelfde poort als de feedback-submit.
    await requireV0Auth();
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    const activeOrg = await getActiveOrgFromCookies();
    const quiz = await getActiveQuizForOrg(activeOrg.id);
    if (!quiz || quiz.status !== 'actief') fail('NOT_FOUND', 'Er staat geen actieve quiz klaar.');
    const question = await getQuestion(questionId);
    if (!question || question.quizId !== quiz.id || question.organizationId !== activeOrg.id) {
      fail('NOT_FOUND', 'Vraag niet gevonden.');
    }
    if (question.verwijderd || !question.goedgekeurd) fail('INPUT_INVALID', 'Deze vraag is niet beschikbaar.');
    // Meerkeuze: valideer de keuze tegen de goedgekeurde opties (geen forged
    // optie-tekst de KB in). 'Anders' valt buiten de lijst en heeft vrije tekst.
    if (question.type === 'meerkeuze' && !payload.skip) {
      const opt = (payload.meerkeuzeOptie ?? '').trim();
      if (opt && opt !== 'Anders' && !(question.opties ?? []).includes(opt)) {
        fail('INPUT_INVALID', 'Ongeldige keuze.');
      }
    }

    // Bepaal het (geredacteerde) antwoord — PII-redactie AAN DE POORT, zodat ruwe
    // PII nooit in de KB of in admin_quiz_answer belandt.
    let antwoord: string | null = null;
    let meerkeuzeOptie: string | null = null;
    let andersTekst: string | null = null;
    let redacted = false;

    if (!payload.skip) {
      if (question.type === 'meerkeuze') {
        meerkeuzeOptie = (payload.meerkeuzeOptie ?? '').trim().slice(0, 500) || null;
        andersTekst = (payload.andersTekst ?? '').trim().slice(0, QUIZ_ANSWER_MAX) || null;
        // 'Anders' is een sentinel, geen antwoord: bij 'Anders' telt de vrije tekst
        // (leeg → geen antwoord, niet de letterlijke string 'Anders' in de KB),
        // anders de gekozen optie.
        antwoord = meerkeuzeOptie === 'Anders' ? andersTekst : meerkeuzeOptie;
      } else {
        antwoord = (payload.antwoord ?? '').trim().slice(0, QUIZ_ANSWER_MAX) || null;
      }
      if (antwoord && antwoord.length > 0) {
        const safe = redactPii(antwoord);
        redacted = safe !== antwoord;
        antwoord = safe;
        if (andersTekst) andersTekst = redactPii(andersTekst);
      }
    }

    // Atomic claim VÓÓR de ingest: UNIQUE(question_id) is de echte idempotentie-
    // grens. Een gelijktijdige tweede submit/replay verliest hier (23505) en
    // bereikt de dure ingest dus nooit — geen dubbele KB-documenten.
    const answer = await createAnswer({
      quizId: quiz.id,
      questionId: question.id,
      organizationId: activeOrg.id,
      antwoord, // null = overgeslagen (of meerkeuze zonder keuze)
      meerkeuzeOptie,
      andersTekst,
      redacted,
    }).catch((e) => {
      if (e instanceof QuizAnswerExistsError) fail('INPUT_INVALID', 'Deze vraag is al beantwoord.');
      throw e;
    });

    // Pas ná de geslaagde claim ingesten (alleen de winnaar komt hier, één keer).
    if (antwoord && antwoord.length > 0) {
      try {
        const res = await ingestText({
          filename: `Quiz-antwoord · ${question.categorieLabel ?? question.categorie}`,
          text: `Vraag: ${question.vraag}\nAntwoord: ${antwoord}`,
          organizationId: activeOrg.id,
          metadata: { origin: 'quiz', quiz_id: quiz.id, question_id: question.id, label: 'quiz-antwoord' },
        });
        await setAnswerIngestedDoc(answer.id, res.docId);
      } catch (e) {
        // Ingest is niet-transactioneel; een fout mag het opgeslagen antwoord niet
        // terugdraaien. We loggen het gat; de operator ziet het antwoord wél terug.
        console.error('[submitQuizAnswer] ingest faalde', (e as Error).message);
      }
    }

    // Tellingen bijwerken + bepalen of de quiz klaar is (resume-cursor = eerste
    // onbeantwoorde actieve vraag).
    const active = await listQuestions(quiz.id, { activeOnly: true });
    const answers = await listAnswers(quiz.id);
    const answeredIds = new Set(answers.map((a) => a.questionId));
    const answeredCount = answers.filter((a) => a.antwoord !== null).length;
    const skippedCount = answers.filter((a) => a.antwoord === null).length;
    await updateQuizCounts(quiz.id, { answeredCount, skippedCount });

    const done = active.length > 0 && active.every((q) => answeredIds.has(q.id));
    if (done) {
      await setQuizStatus(quiz.id, 'voltooid');
      revalidatePath('/admindashboard', 'layout');
    }
    revalidatePath('/klantendashboard', 'layout');
    return { done, answered: answeredCount, total: active.length };
  });
}

// ---------------------------------------------------------------------------
// Bronnen-lezer (M3, item 10) — de klant opent een eigen bron (document of
// gecrawlde website-pagina) en leest de volledige inhoud in een modal. Spiegelt
// adminGetDocContentAction / adminGetPageContentAction, maar resolvet de org uit
// de cookie (geen slug uit de client) i.p.v. de route-param + admin-gate. Reads
// only: geen revalidatePath. Service-role-read (getSystemJobClient) is de
// klant-read-conventie (zie lib/v0/server/crawler.ts getWebsiteSources); altijd
// gefilterd op organization_id zodat een bron van een andere org onbereikbaar is.
// ---------------------------------------------------------------------------

/** Lees de inhoud van een eigen document terug (gereconstrueerd uit de chunks). */
export async function getKlantDocContentAction(
  docId: string,
): Promise<ActionResult<{ filename: string; text: string }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const orgId = activeOrg.id;
    const sb = await getSystemJobClient({ reason: 'klant_view_doc' });
    const { data: doc } = await sb
      .from('documents')
      .select('filename')
      .eq('id', docId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!doc) fail('NOT_FOUND', 'Document niet gevonden.');
    const { data: rows, error } = await sb
      .from('document_chunks')
      .select('content, metadata')
      .eq('document_id', docId)
      .eq('organization_id', orgId);
    if (error) throw new Error(`document_chunks read: ${error.message}`);
    const ordered = (rows ?? [])
      .map((r) => ({
        idx: Number((r.metadata as { chunk_index?: number } | null)?.chunk_index ?? 0),
        content: (r.content as string) ?? '',
      }))
      .sort((a, b) => a.idx - b.idx);
    return { filename: doc.filename as string, text: reconstructFromChunks(ordered.map((o) => o.content)) };
  });
}

// ---------------------------------------------------------------------------
// Meest-gestelde-vragen drilldown (M5, item 3) — open de gesprekken waarin een
// geclusterde vraag is gesteld. De FAQ-snapshot komt uit query_log (geen FK naar
// v0_threads), dus dit is een BENADERENDE tekst-match: we zoeken user-messages in
// v0_thread_messages waarvan de (getrimde, lowercased) content exact overeenkomt
// met één van de cluster-varianten. Org server-side uit de cookie; org-isolatie
// via een JOIN op de eigen thread-ids (v0_thread_messages heeft zelf geen
// organization_id). Read-only: geen revalidatePath.
// ---------------------------------------------------------------------------

export type QuestionConversationHit = {
  threadId: string;
  snippet: string;
  askedAt: string;
};

/** Hoeveel thread-ids we maximaal scannen (org-volumes zijn klein in V0). */
const DRILLDOWN_THREAD_CAP = 1000;
/** Hoeveel recente user-messages we maximaal ophalen vóór de client-side match
 *  + dedupe. Ruim (= PostgREST-paginagrootte) zodat in V0-volumes geen treffers
 *  wegvallen door recency-bias; een te lage cap zou oudere treffers stil droppen
 *  en de modal misleidend "geen gesprekken" laten tonen (Codex M5 #3). */
const DRILLDOWN_ROW_CAP = 1000;
/** Hoeveel unieke gesprekken we maximaal teruggeven. */
const DRILLDOWN_RESULT_CAP = 50;

export async function getConversationsForQuestionAction(
  memberQuestions: string[],
): Promise<ActionResult<{ hits: QuestionConversationHit[] }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const orgId = activeOrg.id;

    // Normaliseer de varianten (trim+lowercase) en dedupe. Lege lijst → geen werk.
    const variants = [
      ...new Set(
        (memberQuestions ?? [])
          .map((q) => String(q ?? '').trim().toLowerCase())
          .filter((q) => q.length > 0),
      ),
    ];
    if (variants.length === 0) return { hits: [] };

    const sb = await getSystemJobClient({ reason: 'klant_faq_drilldown' });

    // 1. Eigen, niet-verwijderde thread-ids (org-isolatie via deze JOIN — de
    //    messages-tabel heeft geen organization_id).
    const { data: threads, error: tErr } = await sb
      .from('v0_threads')
      .select('id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(DRILLDOWN_THREAD_CAP);
    if (tErr) throw new Error(`v0_threads read: ${tErr.message}`);
    const threadIds = (threads ?? []).map((t) => t.id as string);
    if (threadIds.length === 0) return { hits: [] };

    // 2. User-messages binnen die threads, recent-first. We matchen client-side
    //    op trimmed+lowercased content (PostgREST heeft geen normalize-in-filter);
    //    de row-cap houdt het geheugen onder controle.
    const { data: rows, error: mErr } = await sb
      .from('v0_thread_messages')
      .select('thread_id, content, created_at')
      .in('thread_id', threadIds)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(DRILLDOWN_ROW_CAP);
    if (mErr) throw new Error(`v0_thread_messages read: ${mErr.message}`);

    const wanted = new Set(variants);
    const seen = new Set<string>();
    const hits: QuestionConversationHit[] = [];
    for (const r of rows ?? []) {
      const content = String(r.content ?? '');
      const key = content.trim().toLowerCase();
      if (!wanted.has(key)) continue;
      const tid = String(r.thread_id ?? '');
      if (!tid || seen.has(tid)) continue; // dedupe per thread (recent-first)
      seen.add(tid);
      hits.push({
        threadId: tid,
        snippet: content.trim().slice(0, 160),
        askedAt: String(r.created_at ?? ''),
      });
      if (hits.length >= DRILLDOWN_RESULT_CAP) break;
    }
    return { hits };
  });
}

/** Lees de gecrawlde inhoud van één eigen website-pagina terug (content_text). */
export async function getKlantPageContentAction(
  pageId: string,
): Promise<ActionResult<{ title: string; url: string; text: string }>> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const orgId = activeOrg.id;
    const sb = await getSystemJobClient({ reason: 'klant_view_page' });
    const { data: pg } = await sb
      .from('website_pages')
      .select('title, url, content_text')
      .eq('id', pageId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!pg) fail('NOT_FOUND', 'Pagina niet gevonden.');
    return {
      title: (pg.title as string | null) ?? '',
      url: pg.url as string,
      text: (pg.content_text as string | null) ?? '',
    };
  });
}

// ---------------------------------------------------------------------------
// AI-genereer-knoppen (Instellingen) — drie kleine, klant-getriggerde gpt-4o-mini
// calls die helpen de settings in te vullen. Defense-in-depth + cost-rem:
// requireV0Auth + mutation-rate-limit + org server-side uit de cookie. De
// generate-helpers zijn best-effort (gooien niet, geven leeg terug) — we mappen
// een leeg resultaat naar een nette action-error zodat de UI feedback geeft.
// ---------------------------------------------------------------------------

/** #4 — genereer startsuggesties uit bedrijfsomschrijving + meest-gestelde vragen. */
export async function generateStarterQuestionsAction(): Promise<ActionResult<{ questions: string[] }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    const activeOrg = await getActiveOrgFromCookies();
    const settings = await getOrgSettings(activeOrg.slug);
    const snap = await getKlantFaqSnapshot(activeOrg.id);
    const topQuestions = (snap?.items ?? []).slice(0, 8).map((i) => i.question);

    const questions = await generateStarterQuestions({
      chatbotName: settings.chatbot.chatbotName,
      companyDescription: settings.chatbot.companyDescription,
      primaryLanguage: settings.chatbot.primaryLanguage,
      topQuestions,
    });
    if (questions.length === 0) fail('INTERNAL', 'Kon geen suggesties genereren. Probeer het zo nog eens.');
    return { questions };
  });
}

/** #5 — genereer een fallbackbericht toegesneden op het bedrijf + toon + contact. */
export async function generateFallbackMessageAction(): Promise<ActionResult<{ message: string }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    const activeOrg = await getActiveOrgFromCookies();
    const c = (await getOrgSettings(activeOrg.slug)).chatbot;
    const message = await generateFallbackMessage({
      chatbotName: c.chatbotName,
      companyDescription: c.companyDescription,
      toneOfVoice: c.toneOfVoice,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      contactPageUrl: c.contactPageUrl,
      primaryLanguage: c.primaryLanguage,
    });
    if (!message) fail('INTERNAL', 'Kon geen fallbackbericht genereren. Probeer het zo nog eens.');
    return { message };
  });
}

/** #6 — extraheer contactgegevens uit de gecrawlde contact-/over-ons-pagina's. */
export async function extractContactInfoAction(): Promise<ActionResult<ExtractedContact>> {
  return actionTry(async () => {
    await requireV0Auth();
    const limit = await checkMutationLimit();
    if (!limit.allowed) fail('RATE_LIMIT', limit.message, limit.retryAfterSec);

    const activeOrg = await getActiveOrgFromCookies();
    const pagesText = await collectContactPagesText(activeOrg.id);
    if (!pagesText) {
      fail('NOT_FOUND', 'Geen gecrawlde pagina’s gevonden. Crawl eerst je website in de Kennisbank.');
    }
    const info = await extractContactInfo({ pagesText });
    if (!info.contactEmail && !info.contactPhone && !info.contactPageUrl) {
      fail('NOT_FOUND', 'Geen contactgegevens gevonden op je gecrawlde pagina’s. Vul ze handmatig in.');
    }
    return info;
  });
}

/** Verzamel de tekst van de meest contact-relevante gecrawlde pagina's (org-
 *  gescopet service-role-read, zoals getKlantPageContentAction). Prefereert
 *  contact-/over-ons-pagina's; anders een kleine sample. Begrensd zodat de
 *  LLM-prompt klein blijft. */
async function collectContactPagesText(orgId: string): Promise<string> {
  const sb = await getSystemJobClient({ reason: 'extract_contact_info' });
  const { data } = await sb
    .from('website_pages')
    .select('url, title, content_text')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .limit(200);
  const pages = (data ?? []).filter((p) => ((p.content_text as string | null) ?? '').trim().length > 0);
  if (pages.length === 0) return '';
  const CONTACT_RE = /contact|over-?ons|about|colofon|bereik/i;
  const preferred = pages.filter((p) => CONTACT_RE.test(`${p.url ?? ''} ${p.title ?? ''}`));
  const chosen = (preferred.length > 0 ? preferred : pages).slice(0, 5);
  return chosen
    .map((p) => `URL: ${p.url ?? ''}\n${((p.content_text as string) ?? '').slice(0, 4000)}`)
    .join('\n\n---\n\n')
    .slice(0, 16000);
}
