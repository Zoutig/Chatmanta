// Demo-versie van askV1 (origineel: app/v1/app/actions.ts). Geen server action:
// een gewone client-functie die de publieke demo-chat aanroept met de instellingen
// uit de browser van de bezoeker. Zelfde signatuur en resultaatvorm, zodat Preview
// en "Huidig antwoord van je bot" ongewijzigd blijven.

import { streamDemoChat } from '@/lib/voorbeeld/demo-chat';
import { readDemoSettings } from '@/lib/voorbeeld/demo-store';

export type AskV1Result =
  | { ok: true; answer: string; sources: { title: string }[]; kind: string }
  | {
      ok: false;
      error: 'NO_CHATBOT' | 'FORBIDDEN' | 'FAILED' | 'RATE_LIMITED' | 'BUDGET_EXHAUSTED' | 'MONTHLY_LIMIT' | 'ORG_SUSPENDED';
    };

export async function askV1(
  question: string,
  history?: { role: 'user' | 'assistant'; content: string }[],
): Promise<AskV1Result> {
  if (!question || question.trim().length === 0) return { ok: false, error: 'FAILED' };
  const res = await streamDemoChat({ question: question.trim(), history: history ?? [], settings: readDemoSettings() });
  if (res.ok) return { ok: true, answer: res.answer, sources: res.sources, kind: res.kind };
  return { ok: false, error: res.error === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'FAILED' };
}
