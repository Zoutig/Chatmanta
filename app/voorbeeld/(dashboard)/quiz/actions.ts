// Voorbeeld-dashboard: quiz-antwoord indienen zonder server. Zelfde export,
// payload en return-vorm als de V1-server-action. Het antwoord gaat niet echt de
// kennisbank in; de voortgang leeft in het geheugen van deze pagina-sessie.

import { DEMO_QUIZ_QUESTIONS } from '@/lib/voorbeeld/fixtures/quiz';
import { pretendDelay } from '@/lib/voorbeeld/fixtures/contact';
import { getQuizProgress, recordQuizAnswer } from './quiz-progress';

const QUIZ_ANSWER_MAX = 2000;

type SubmitPayload = {
  antwoord?: string | null;
  meerkeuzeOptie?: string | null;
  andersTekst?: string | null;
  skip?: boolean;
};

type SubmitResult =
  | { ok: true; done: boolean; answered: number; total: number }
  | { ok: false; error: string };

export async function submitQuizAnswerV1Action(
  questionId: string,
  payload: SubmitPayload,
): Promise<SubmitResult> {
  const question = DEMO_QUIZ_QUESTIONS.find((q) => q.id === questionId);
  if (!question) return { ok: false, error: 'Vraag niet gevonden.' };
  if (questionId in getQuizProgress()) return { ok: false, error: 'Deze vraag is al beantwoord.' };

  if (question.type === 'meerkeuze' && !payload.skip) {
    const opt = (payload.meerkeuzeOptie ?? '').trim();
    if (opt && opt !== 'Anders' && !(question.opties ?? []).includes(opt)) {
      return { ok: false, error: 'Ongeldige keuze.' };
    }
  }

  let antwoord: string | null = null;
  if (!payload.skip) {
    if (question.type === 'meerkeuze') {
      const opt = (payload.meerkeuzeOptie ?? '').trim() || null;
      antwoord = opt === 'Anders' ? (payload.andersTekst ?? '').trim().slice(0, QUIZ_ANSWER_MAX) || null : opt;
    } else {
      antwoord = (payload.antwoord ?? '').trim().slice(0, QUIZ_ANSWER_MAX) || null;
    }
  }

  await pretendDelay();
  recordQuizAnswer(question.id, antwoord);

  const answers = Object.values(getQuizProgress());
  const total = DEMO_QUIZ_QUESTIONS.length;
  const done = DEMO_QUIZ_QUESTIONS.every((q) => q.id in getQuizProgress());
  return { ok: true, done, answered: answers.filter((a) => a !== null).length, total };
}
