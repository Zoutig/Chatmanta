'use client';

// Voorbeeld-dashboard: Gesprekken › "Wist je chatbot niet". Zelfde component als V1
// (UnansweredList), met de acties van het voorbeeld: een antwoord gaat via de demo-
// Q&A (browser-opslag, de demo-chat gebruikt het daarna echt); "Markeer als opgelost"
// doet alsof. Er wordt niets op een server opgeslagen.

import { UnansweredList, type UnansweredRow } from '@/app/v1/app/gesprekken/unanswered/unanswered-list';
import { upsertQAItemAction } from '../kennisbank/qa/qa-actions';
import { CurrentBotAnswer } from '../kennisbank/qa/current-bot-answer';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function saveQA(question: string, answer: string) {
  const res = await upsertQAItemAction({ question, answer, active: true });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

async function resolveQuestion(question: string) {
  await pause(400);
  return question.trim() ? { ok: true } : { ok: false, error: 'Geen vraag opgegeven.' };
}

const conversationHref = (id: string) => `/voorbeeld/gesprekken/${encodeURIComponent(id)}`;

export function DemoUnansweredTab({ questions }: { questions: UnansweredRow[] }) {
  return (
    <UnansweredList
      questions={questions}
      saveQA={saveQA}
      resolveQuestion={resolveQuestion}
      BotAnswer={CurrentBotAnswer}
      conversationHref={conversationHref}
      previewHref="/voorbeeld/preview"
    />
  );
}
