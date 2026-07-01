'use server';

// V1 Admin — Quiz-acties (genereren, vragen beheren, activeren, annuleren).
//
// Auth: getJorionAdminClient() doet requireJorionAdmin() intern (service-role
// NÁ admin-check). orgId = UUID uit de route-param, gevalideerd door de DB
// (chatbot-lookup faalt bij onbekende org). Kosten worden best-effort in
// v1_quiz.*_cost_usd gezet — nooit in query_log (quiz-kosten zijn admin-laag,
// niet per-klant-billing). maxDuration=120 op de route dekt de analyse (~15-60s).

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { actionTry, fail, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { getOrgChatbot } from '@/app/v1/app/rag-config';
import {
  QUIZ_ANALYSE_MODELS,
  type QuizAnalyseModel,
  type QuizQuestionInput,
  type QuizQuestionPatch,
  type QuizStatus,
} from '@/lib/controlroom/types';
import {
  createQuiz,
  getActiveQuizForOrg,
  getQuestion,
  getQuiz,
  insertQuestions,
  listQuestions,
  QuizExistsError,
  setQuizStatus,
  softDeleteQuestion,
  updateQuestion,
  updateQuizCounts,
} from '@/lib/v1/quiz/data';
import { analyzeKnowledgeBase, hasAnalyzableContent } from '@/lib/v1/quiz/analysis';

// Statussen die opnieuw gegenereerd mogen worden (actief + voltooid zijn finaal).
const QUIZ_RETRIGGERABLE = new Set<QuizStatus>(['concept', 'leeg', 'mislukt', 'generating']);

const ADMIN_QUIZ_PATH = '/v1/admin/quiz';

function revalidate(orgId?: string) {
  revalidatePath(ADMIN_QUIZ_PATH, 'layout');
  if (orgId) revalidatePath(`${ADMIN_QUIZ_PATH}/${orgId}`);
}

function authFail(e: unknown): ActionFail {
  if (isAppError(e) && e.code === 'AUTH_FORBIDDEN')
    return { ok: false, error: 'Geen toegang — Jorion-admin vereist.', code: 'AUTH_FORBIDDEN' };
  throw e; // NEXT_REDIRECT (geen sessie) propageren
}

async function requireAdmin(): Promise<SupabaseClient> {
  return getJorionAdminClient();
}

// ── Genereren ────────────────────────────────────────────────────────────────

export async function generateQuizForOrgAction(
  orgId: string,
  model: QuizAnalyseModel,
): Promise<ActionResult<{ quizId: string; status: string; questionCount: number }>> {
  let admin: SupabaseClient;
  try { admin = await requireAdmin(); } catch (e) { return authFail(e); }

  return actionTry(async () => {
    if (!(QUIZ_ANALYSE_MODELS as readonly string[]).includes(model)) {
      fail('INPUT_INVALID', `Onbekend model: ${model}`);
    }

    const chatbot = await getOrgChatbot(admin, orgId);
    if (!chatbot) fail('NOT_FOUND', 'Geen chatbot geconfigureerd voor deze org. Maak er eerst een aan.');

    if (!(await hasAnalyzableContent(admin, orgId, chatbot.id))) {
      fail(
        'INPUT_INVALID',
        'Kennisbank is leeg. Voeg eerst minimaal een kennisbron toe (document of website-scrape) voordat je de analyse start.',
      );
    }

    // Re-trigger: annuleer retriggerable quiz; blokkeer op actief/voltooid.
    const existing = await getActiveQuizForOrg(admin, orgId);
    if (existing) {
      if (!QUIZ_RETRIGGERABLE.has(existing.status)) {
        fail(
          'INPUT_INVALID',
          `Er is al een ${existing.status} quiz voor deze klant. Een actieve of voltooide quiz kan niet opnieuw gegenereerd worden.`,
        );
      }
      await setQuizStatus(admin, existing.id, 'geannuleerd');
    }

    let quiz;
    try {
      quiz = await createQuiz(admin, { organizationId: orgId, analyseModel: model });
    } catch (e) {
      if (e instanceof QuizExistsError) fail('INPUT_INVALID', 'Er is al een quiz voor deze org (race-conditie). Ververs de pagina.');
      throw e;
    }

    const summary = await analyzeKnowledgeBase({
      client: admin,
      quizId: quiz.id,
      organizationId: orgId,
      chatbotId: chatbot.id,
      model,
    });

    revalidate(orgId);
    return { quizId: quiz.id, status: summary.status, questionCount: summary.questionCount };
  });
}

// ── Vraag-beheer ─────────────────────────────────────────────────────────────

export async function setQuizQuestionApprovedAction(
  orgId: string,
  questionId: string,
  approved: boolean,
): Promise<ActionResult<{ id: string }>> {
  let admin: SupabaseClient;
  try { admin = await requireAdmin(); } catch (e) { return authFail(e); }
  return actionTry(async () => {
    await requireConceptQuestion(admin, questionId, orgId);
    await updateQuestion(admin, questionId, { goedgekeurd: approved });
    revalidate(orgId);
    return { id: questionId };
  });
}

export async function updateQuizQuestionAction(
  orgId: string,
  questionId: string,
  patch: QuizQuestionPatch,
): Promise<ActionResult<{ id: string }>> {
  let admin: SupabaseClient;
  try { admin = await requireAdmin(); } catch (e) { return authFail(e); }
  return actionTry(async () => {
    await requireConceptQuestion(admin, questionId, orgId);
    if (patch.vraag !== undefined) {
      const v = patch.vraag.trim();
      if (v.length < 1 || v.length > 2000) fail('INPUT_INVALID', 'Vraag moet tussen 1 en 2000 tekens zijn.');
    }
    await updateQuestion(admin, questionId, patch);
    revalidate(orgId);
    return { id: questionId };
  });
}

export async function deleteQuizQuestionAction(
  orgId: string,
  quizId: string,
  questionId: string,
): Promise<ActionResult<{ id: string }>> {
  let admin: SupabaseClient;
  try { admin = await requireAdmin(); } catch (e) { return authFail(e); }
  return actionTry(async () => {
    await requireConceptQuestion(admin, questionId, orgId);
    await softDeleteQuestion(admin, quizId, questionId);
    revalidate(orgId);
    return { id: questionId };
  });
}

export async function addQuizQuestionAction(
  orgId: string,
  quizId: string,
  input: QuizQuestionInput,
): Promise<ActionResult<{ id: string }>> {
  let admin: SupabaseClient;
  try { admin = await requireAdmin(); } catch (e) { return authFail(e); }
  return actionTry(async () => {
    const quiz = await getQuiz(admin, quizId);
    if (!quiz || quiz.organizationId !== orgId) fail('NOT_FOUND', 'Quiz niet gevonden.');
    if (quiz.status !== 'concept') fail('INPUT_INVALID', `Vragen toevoegen kan alleen in een concept-quiz (status: ${quiz.status}).`);
    const vraag = (input.vraag ?? '').trim();
    if (vraag.length < 1 || vraag.length > 2000) fail('INPUT_INVALID', 'Vraag moet tussen 1 en 2000 tekens zijn.');
    const created = await insertQuestions(admin, quizId, orgId, [
      { ...input, vraag, bron: 'niels', goedgekeurd: true },
    ]);
    revalidate(orgId);
    return { id: created[0]?.id ?? '' };
  });
}

// ── Activeren / annuleren ─────────────────────────────────────────────────────

export async function activateQuizAction(
  orgId: string,
  quizId: string,
): Promise<ActionResult<{ id: string }>> {
  let admin: SupabaseClient;
  try { admin = await requireAdmin(); } catch (e) { return authFail(e); }
  return actionTry(async () => {
    const quiz = await getQuiz(admin, quizId);
    if (!quiz || quiz.organizationId !== orgId) fail('NOT_FOUND', 'Quiz niet gevonden.');
    if (quiz.status !== 'concept') {
      fail('INPUT_INVALID', `Alleen een concept-quiz kan geactiveerd worden (huidige status: ${quiz.status}).`);
    }
    const active = await listQuestions(admin, quizId, { activeOnly: true });
    if (active.length === 0) {
      fail('INPUT_INVALID', 'Keur eerst minimaal een vraag goed voordat je de quiz activeert.');
    }
    await updateQuizCounts(admin, quizId, { questionCount: active.length });
    await setQuizStatus(admin, quizId, 'actief');
    revalidate(orgId);
    // Klant-banner (quiz-pagina) moet meteen verschijnen:
    revalidatePath('/v1/app', 'layout');
    return { id: quizId };
  });
}

export async function cancelQuizAction(
  orgId: string,
  quizId: string,
): Promise<ActionResult<{ id: string }>> {
  let admin: SupabaseClient;
  try { admin = await requireAdmin(); } catch (e) { return authFail(e); }
  return actionTry(async () => {
    const quiz = await getQuiz(admin, quizId);
    if (!quiz || quiz.organizationId !== orgId) fail('NOT_FOUND', 'Quiz niet gevonden.');
    if (quiz.status === 'voltooid') {
      fail('INPUT_INVALID', 'Een voltooide quiz kan niet meer geannuleerd worden (eenmalig per klant).');
    }
    await setQuizStatus(admin, quizId, 'geannuleerd');
    revalidate(orgId);
    return { id: quizId };
  });
}

// ── Guards ────────────────────────────────────────────────────────────────────

async function requireConceptQuestion(
  admin: SupabaseClient,
  questionId: string,
  orgId: string,
): Promise<void> {
  const q = await getQuestion(admin, questionId);
  if (!q || q.organizationId !== orgId) fail('NOT_FOUND', 'Vraag niet gevonden.');
  const quiz = await getQuiz(admin, q.quizId);
  if (!quiz || quiz.status !== 'concept') {
    fail('INPUT_INVALID', 'Vragen bewerken kan alleen in een concept-quiz.');
  }
}
