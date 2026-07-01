'use server';

// V1 klant — quiz-antwoord indienen.
//
// Auth (SA-1): getSessionOrg() + requireOrgMember() vóór elke service-role-write.
// Org uit de getrouwde sessie, NOOIT uit client-input. questionId valideert via DB
// (vraag.quizId == actieve quiz van deze org). PII-redactie aan de poort (redactPii)
// vóór ingest of opslag. UNIQUE(question_id) is de echte idempotentie-grens.

import { revalidatePath } from 'next/cache';
import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { redactPii } from '@/lib/observability/redact';
import { ingestDocument } from '@/lib/rag/ingest';
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

type SubmitPayload = {
  antwoord?: string | null;
  meerkeuzeOptie?: string | null;
  andersTekst?: string | null;
  skip?: boolean;
};

type SubmitResult =
  | { ok: true; done: boolean; answered: number; total: number }
  | { ok: false; error: string };

function authFail(e: unknown): SubmitResult {
  if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') return { ok: false, error: 'Geen toegang.' };
  throw e; // NEXT_REDIRECT (geen sessie) propageren
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

    // PII-redactie aan de poort.
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
        const safe = redactPii(antwoord);
        redacted = safe !== antwoord;
        antwoord = safe;
        if (andersTekst) andersTekst = redactPii(andersTekst);
      }
    }

    // Atomic claim: UNIQUE(question_id) is de echte idempotentie-grens.
    let answer;
    try {
      answer = await createAnswer(sb, {
        quizId: quiz.id,
        questionId: question.id,
        organizationId: orgId,
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
    if (antwoord && antwoord.length > 0) {
      try {
        const chatbot = await getOrgChatbot(sb, orgId);
        if (chatbot) {
          const res = await ingestDocument(sb, {
            organizationId: orgId,
            chatbotId: chatbot.id,
            filename: `Quiz-antwoord · ${question.categorieLabel ?? question.categorie}`,
            text: `Vraag: ${question.vraag}\nAntwoord: ${antwoord}`,
            source: 'upload',
            metadata: { origin: 'quiz', quiz_id: quiz.id, question_id: question.id, label: 'quiz-antwoord' },
          });
          await setAnswerIngestedDoc(sb, answer.id, res.documentId);
        }
      } catch (e) {
        // Ingest is niet-transactioneel; een fout mag het opgeslagen antwoord niet
        // terugdraaien. De operator ziet het antwoord in de quiz-rij.
        console.error('[v1:submitQuizAnswer] ingest faalde', (e as Error).message);
      }
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
    return { ok: true, done, answered: answeredCount, total: active.length };
  } catch (e) {
    console.error('[v1:submitQuizAnswerV1Action]', e);
    return { ok: false, error: 'Er ging iets mis. Probeer het opnieuw.' };
  }
}
