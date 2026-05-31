'use server';

// V0 klantendashboard — server actions voor settings-persistentie.
//
// Patroon: actionTry + actieve org server-side resolven (geen slug uit client
// payload — voorkomt cross-org tampering, defense-in-depth bovenop V0's gedeelde
// password-gate). Na succesvolle write revalidatePath('/klantendashboard', 'layout')
// + bij widget-changes ook '/widget' zodat de demo-pagina meteen herrendert.

import { revalidatePath } from 'next/cache';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';
import { getActiveOrgFromCookies, KNOWN_ORGS } from '@/lib/v0/server/active-org';
import { requireV0Auth } from '@/app/actions/_auth';
import { checkMutationLimit } from '@/lib/v0/server/rate-limit';
import {
  getActiveQuizForOrg,
  getAnswerForQuestion,
  getQuestion,
  listAnswers,
  listQuestions,
  recordAnswer,
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
} from '@/lib/controlroom/server/feedback';
import { parseFeedbackForm, assertValidAttachment } from '@/lib/controlroom/feedback-validate';
import { notifyNewFeedback } from '@/lib/notifications/feedback-notify';
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
    // Idempotent: een al beantwoorde/overgeslagen vraag niet opnieuw verwerken
    // (voorkomt dubbele KB-documenten + embed-kosten bij dubbelklik/replay).
    if (await getAnswerForQuestion(question.id)) fail('INPUT_INVALID', 'Deze vraag is al beantwoord.');
    // Meerkeuze: valideer de keuze tegen de goedgekeurde opties (geen forged
    // optie-tekst de KB in). 'Anders' valt buiten de lijst en heeft vrije tekst.
    if (question.type === 'meerkeuze' && !payload.skip) {
      const opt = (payload.meerkeuzeOptie ?? '').trim();
      if (opt && opt !== 'Anders' && !(question.opties ?? []).includes(opt)) {
        fail('INPUT_INVALID', 'Ongeldige keuze.');
      }
    }

    let antwoord: string | null = null;
    let meerkeuzeOptie: string | null = null;
    let andersTekst: string | null = null;
    let ingestedDocumentId: string | null = null;
    let redacted = false;

    if (!payload.skip) {
      if (question.type === 'meerkeuze') {
        meerkeuzeOptie = (payload.meerkeuzeOptie ?? '').trim().slice(0, 500) || null;
        andersTekst = (payload.andersTekst ?? '').trim().slice(0, QUIZ_ANSWER_MAX) || null;
        antwoord = andersTekst ?? meerkeuzeOptie; // 'Anders'-tekst heeft voorrang
      } else {
        antwoord = (payload.antwoord ?? '').trim().slice(0, QUIZ_ANSWER_MAX) || null;
      }

      if (antwoord && antwoord.length > 0) {
        // PII-redactie AAN DE POORT — ruwe PII komt nooit in de KB of in admin_quiz_answer.
        const safe = redactPii(antwoord);
        redacted = safe !== antwoord;
        antwoord = safe;
        if (andersTekst) andersTekst = redactPii(andersTekst);
        try {
          const res = await ingestText({
            filename: `Quiz-antwoord · ${question.categorieLabel ?? question.categorie}`,
            text: `Vraag: ${question.vraag}\nAntwoord: ${safe}`,
            organizationId: activeOrg.id,
            metadata: { origin: 'quiz', quiz_id: quiz.id, question_id: question.id, label: 'quiz-antwoord' },
          });
          ingestedDocumentId = res.docId;
        } catch (e) {
          // Ingest is niet-transactioneel; een fout mag het antwoord-opslaan niet
          // blokkeren. We loggen het gat; de operator ziet het antwoord wél terug.
          console.error('[submitQuizAnswer] ingest faalde', (e as Error).message);
        }
      }
    }

    await recordAnswer({
      quizId: quiz.id,
      questionId: question.id,
      organizationId: activeOrg.id,
      antwoord, // null = overgeslagen (of meerkeuze zonder keuze)
      meerkeuzeOptie,
      andersTekst,
      ingestedDocumentId,
      redacted,
    });

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
