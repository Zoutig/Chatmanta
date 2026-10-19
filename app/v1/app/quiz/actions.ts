'use server';

// V1 klant — quiz-antwoord indienen + mislukte inlees-pogingen opnieuw proberen.
//
// Auth (SA-1): getSessionOrg() + requireOrgMember() vóór elke service-role-write.
// Org uit de getrouwde sessie, NOOIT uit client-input. questionId valideert via DB
// (vraag.quizId == actieve quiz van deze org). UNIQUE(question_id) is de echte
// idempotentie-grens; de koppeling antwoord→document is een conditionele claim.
//
// Redactie (gelijkgetrokken met de handmatige Q&A): zakelijke e-mail/telefoon/website
// blijven staan, alleen IBAN/BSN worden gemaskeerd (sanitizeQuizAnswer).
// Na een geslaagde ingest: answer-cache purgen (zelfde patroon als qa-actions).

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { ingestDocument, purgeAnswerCache } from '@/lib/rag/ingest';
import { answersMissingIngest, quizIngestInput, sanitizeQuizAnswer } from '@/lib/v1/quiz/answer-ingest';
import type { QuizQuestion } from '@/lib/controlroom/types';
import { getOrgChatbot } from '../rag-config';
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
} from '@/lib/v1/quiz/data';

const QUIZ_ANSWER_MAX = 2000;
const QUIZ_PATH = '/v1/app/quiz';
const KENNISBANK_PATH = '/v1/app/kennisbank';
/** Max. antwoorden per retry-klik (een quiz heeft er hooguit 20). */
const RETRY_MAX = 20;

type SubmitPayload = {
  antwoord?: string | null;
  meerkeuzeOptie?: string | null;
  andersTekst?: string | null;
  skip?: boolean;
};

type SubmitResult =
  | { ok: true; done: boolean; answered: number; total: number; ingestFailed: boolean }
  | { ok: false; error: string };

function authFail(e: unknown): { ok: false; error: string } {
  if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') return { ok: false, error: 'Geen toegang.' };
  throw e; // NEXT_REDIRECT (geen sessie) propageren
}

/**
 * Lees één antwoord in als KB-document en koppel het (conditioneel) aan het antwoord.
 * 'ok' = gekoppeld; 'duplicate' = een gelijktijdige poging was eerder (ons document is
 * weer opgeruimd); 'failed' = ingest of koppeling mislukte (antwoord blijft bewaard).
 * Purgen doet de caller (één keer per actie).
 */
async function ingestQuizAnswer(
  sb: SupabaseClient,
  ctx: { orgId: string; chatbotId: string; quizId: string },
  question: Pick<QuizQuestion, 'id' | 'vraag' | 'categorie' | 'categorieLabel'>,
  answerId: string,
  antwoord: string,
): Promise<'ok' | 'duplicate' | 'failed'> {
  let documentId: string;
  try {
    const input = quizIngestInput(question, ctx.quizId, antwoord);
    const res = await ingestDocument(sb, {
      organizationId: ctx.orgId,
      chatbotId: ctx.chatbotId,
      filename: input.filename,
      text: input.text,
      source: 'upload',
      metadata: input.metadata,
    });
    documentId = res.documentId;
  } catch (e) {
    console.error('[v1:quiz] ingest faalde', (e as Error).message);
    return 'failed';
  }

  const claimed = await setAnswerIngestedDoc(sb, answerId, documentId, ctx.orgId);
  if (claimed) return 'ok';

  // Niet geclaimd: óf een andere poging koppelde al een document (→ het onze is dubbel),
  // óf de update faalde. In beide gevallen ons document uit de retrieval halen, zodat
  // er nooit een ongekoppeld (onbeheerbaar) duplicaat blijft staan.
  await sb
    .from('documents')
    .update({ included: false, deleted_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('organization_id', ctx.orgId)
    .eq('chatbot_id', ctx.chatbotId);
  const { data: row } = await sb
    .from('v1_quiz_answer')
    .select('ingested_document_id')
    .eq('id', answerId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  return row?.ingested_document_id ? 'duplicate' : 'failed';
}

export async function submitQuizAnswerV1Action(
  questionId: string,
  payload: SubmitPayload,
): Promise<SubmitResult> {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
    await requireOrgMember(orgId);
  } catch (e) {
    return authFail(e);
  }

  const sb = getV1ServiceRoleClient();

  try {
    const quiz = await getActiveQuizForOrg(sb, orgId);
    if (!quiz || quiz.status !== 'actief') {
      return { ok: false, error: 'Er staat geen actieve quiz klaar.' };
    }

    const question = await getQuestion(sb, questionId);
    if (!question || question.quizId !== quiz.id || question.organizationId !== orgId) {
      return { ok: false, error: 'Vraag niet gevonden.' };
    }
    if (question.verwijderd || !question.goedgekeurd) {
      return { ok: false, error: 'Deze vraag is niet beschikbaar.' };
    }

    // Meerkeuze: valideer de keuze tegen de goedgekeurde opties.
    if (question.type === 'meerkeuze' && !payload.skip) {
      const opt = (payload.meerkeuzeOptie ?? '').trim();
      if (opt && opt !== 'Anders' && !(question.opties ?? []).includes(opt)) {
        return { ok: false, error: 'Ongeldige keuze.' };
      }
    }

    let antwoord: string | null = null;
    let meerkeuzeOptie: string | null = null;
    let andersTekst: string | null = null;
    let redacted = false;

    if (!payload.skip) {
      if (question.type === 'meerkeuze') {
        meerkeuzeOptie = (payload.meerkeuzeOptie ?? '').trim().slice(0, 500) || null;
        andersTekst = (payload.andersTekst ?? '').trim().slice(0, QUIZ_ANSWER_MAX) || null;
        antwoord = meerkeuzeOptie === 'Anders' ? andersTekst : meerkeuzeOptie;
      } else {
        antwoord = (payload.antwoord ?? '').trim().slice(0, QUIZ_ANSWER_MAX) || null;
      }
      if (antwoord && antwoord.length > 0) {
        const safe = sanitizeQuizAnswer(antwoord);
        redacted = safe.redacted;
        antwoord = safe.text;
        if (andersTekst) andersTekst = sanitizeQuizAnswer(andersTekst).text;
      }
    }

    const chatbot = await getOrgChatbot(sb, orgId);
    if (!chatbot) return { ok: false, error: 'Er is nog geen chatbot ingesteld.' };

    // Atomic claim: UNIQUE(question_id) is de echte idempotentie-grens.
    let answer;
    try {
      answer = await createAnswer(sb, {
        quizId: quiz.id,
        questionId: question.id,
        organizationId: orgId,
        chatbotId: chatbot.id,
        antwoord,
        meerkeuzeOptie,
        andersTekst,
        redacted,
      });
    } catch (e) {
      if (e instanceof QuizAnswerExistsError) {
        return { ok: false, error: 'Deze vraag is al beantwoord.' };
      }
      throw e;
    }

    // Ingest — pas na de geslaagde claim (één winner, geen dubbele KB-documenten).
    // Een fout draait het opgeslagen antwoord niet terug; de klant ziet het op de
    // quizpagina als "nog niet verwerkt" met een knop om het opnieuw te proberen.
    let ingestFailed = false;
    if (antwoord && antwoord.length > 0) {
      const res = await ingestQuizAnswer(
        sb,
        { orgId, chatbotId: chatbot.id, quizId: quiz.id },
        question,
        answer.id,
        antwoord,
      );
      if (res === 'failed') ingestFailed = true;
      else await purgeAnswerCache(sb, orgId, chatbot.id); // best-effort (logt, gooit niet)
    }

    // Tellingen bijwerken + bepalen of de quiz klaar is.
    const [active, answers] = await Promise.all([
      listQuestions(sb, quiz.id, { activeOnly: true }),
      listAnswers(sb, quiz.id),
    ]);
    const answeredIds = new Set(answers.map((a) => a.questionId));
    const answeredCount = answers.filter((a) => a.antwoord !== null).length;
    const skippedCount = answers.filter((a) => a.antwoord === null).length;
    await updateQuizCounts(sb, quiz.id, { answeredCount, skippedCount });

    const done = active.length > 0 && active.every((q) => answeredIds.has(q.id));
    if (done) {
      await setQuizStatus(sb, quiz.id, 'voltooid');
      revalidatePath('/v1/admin/quiz', 'layout');
    }
    revalidatePath(QUIZ_PATH);
    revalidatePath(KENNISBANK_PATH);
    return { ok: true, done, answered: answeredCount, total: active.length, ingestFailed };
  } catch (e) {
    console.error('[v1:submitQuizAnswerV1Action]', e);
    return { ok: false, error: 'Er ging iets mis. Probeer het opnieuw.' };
  }
}

type RetryResult = { ok: true; retried: number; failed: number } | { ok: false; error: string };

/**
 * Lees de antwoorden van de quiz van deze org die nog niet in de kennisbank staan
 * opnieuw in. Geen ID's van de client: quiz en antwoorden komen uit de sessie-org.
 * Antwoorden jonger dan de grace-periode worden overgeslagen (eerste poging kan nog
 * lopen); de conditionele koppeling voorkomt dubbele documenten bij een race.
 */
export async function retryQuizIngestV1Action(): Promise<RetryResult> {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
    await requireOrgMember(orgId);
  } catch (e) {
    return authFail(e);
  }

  const sb = getV1ServiceRoleClient();
  try {
    const quiz = await getActiveQuizForOrg(sb, orgId);
    if (!quiz || quiz.organizationId !== orgId || (quiz.status !== 'actief' && quiz.status !== 'voltooid')) {
      return { ok: false, error: 'Er is geen quiz om te verwerken.' };
    }
    const chatbot = await getOrgChatbot(sb, orgId);
    if (!chatbot) return { ok: false, error: 'Er is nog geen chatbot ingesteld.' };

    const [questions, answers] = await Promise.all([listQuestions(sb, quiz.id), listAnswers(sb, quiz.id)]);
    const byId = new Map(questions.map((q) => [q.id, q]));
    const todo = answersMissingIngest(
      answers.filter((a) => a.organizationId === orgId),
      Date.now(),
    ).slice(0, RETRY_MAX);

    let retried = 0;
    let failed = 0;
    for (const a of todo) {
      const q = byId.get(a.questionId);
      if (!q || q.organizationId !== orgId || !a.antwoord) {
        failed += 1;
        continue;
      }
      const res = await ingestQuizAnswer(
        sb,
        { orgId, chatbotId: chatbot.id, quizId: quiz.id },
        q,
        a.id,
        a.antwoord,
      );
      if (res === 'failed') failed += 1;
      else retried += 1;
    }
    if (retried > 0) await purgeAnswerCache(sb, orgId, chatbot.id);

    revalidatePath(QUIZ_PATH);
    revalidatePath(KENNISBANK_PATH);
    return { ok: true, retried, failed };
  } catch (e) {
    console.error('[v1:retryQuizIngestV1Action]', e);
    return { ok: false, error: 'Er ging iets mis. Probeer het opnieuw.' };
  }
}
