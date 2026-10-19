// V1 quiz: pure helpers rond het inlezen van een antwoord in de kennisbank.
// Geen DB/netwerk, geen 'server-only' → unit-testbaar (lib/v1/quiz/__tests__).

import { redactSensitiveNumbers } from '@/lib/observability/redact';
import type { QuizAnswer, QuizQuestion } from '@/lib/controlroom/types';

/** Antwoorden jonger dan dit kunnen nog midden in hun eerste inlees-poging zitten. */
export const INGEST_GRACE_MS = 2 * 60 * 1000;

/**
 * Maak een quiz-antwoord klaar voor opslag en kennisbank. Gelijkgetrokken met de
 * handmatige Q&A: de ondernemer schrijft hier over zijn eigen bedrijf, dus zakelijke
 * e-mail, telefoon en website blijven staan (de categorie "Contactgegevens" vraagt er
 * juist om). Alleen gevoelige nummers (IBAN, BSN) worden gemaskeerd.
 */
export function sanitizeQuizAnswer(text: string): { text: string; redacted: boolean } {
  const safe = redactSensitiveNumbers(text);
  return { text: safe, redacted: safe !== text };
}

/** Het document dat een quiz-antwoord in de kennisbank wordt. */
export function quizIngestInput(
  question: Pick<QuizQuestion, 'id' | 'vraag' | 'categorie' | 'categorieLabel'>,
  quizId: string,
  antwoord: string,
): { filename: string; text: string; metadata: Record<string, unknown> } {
  return {
    filename: `Quiz-antwoord · ${question.categorieLabel ?? question.categorie}`,
    text: `Vraag: ${question.vraag}\nAntwoord: ${antwoord}`,
    metadata: { origin: 'quiz', quiz_id: quizId, question_id: question.id, label: 'quiz-antwoord' },
  };
}

/**
 * Ingevulde antwoorden die (nog) niet in de kennisbank staan: antwoord gevuld, maar
 * geen gekoppeld document. Met `now` worden antwoorden binnen de grace-periode
 * overgeslagen (die kunnen nog bezig zijn met hun eerste poging).
 */
export function answersMissingIngest<T extends Pick<QuizAnswer, 'antwoord' | 'ingestedDocumentId' | 'createdAt'>>(
  answers: T[],
  now?: number,
): T[] {
  return answers.filter((a) => {
    if (a.antwoord === null || a.antwoord.trim() === '' || a.ingestedDocumentId) return false;
    if (now === undefined) return true;
    const t = Date.parse(a.createdAt);
    return Number.isNaN(t) || now - t >= INGEST_GRACE_MS;
  });
}
