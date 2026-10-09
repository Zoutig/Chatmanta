// Voorbeeld-dashboard: acties voor "Meest gestelde vragen". Zelfde exports en
// return-vormen als de V1-server actions (app/v1/app/gesprekken/top-questions-actions.ts),
// maar zonder server: opslaan "doet alsof", de drilldown leest de voorbeeldgesprekken.

import type { ActionResult } from '@/lib/errors/action';
import type { TopQuestionsConfig } from '@/lib/v0/klantendashboard/types';
import { findFixtureConversationsForQuestions } from '@/lib/voorbeeld/fixtures/gesprekken';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sla de ranglijst-instellingen op (in het voorbeeld: alleen bevestigen). */
export async function saveTopQuestionsConfigAction(
  config: TopQuestionsConfig,
): Promise<ActionResult<{ topQuestions: TopQuestionsConfig }>> {
  await pause(450);
  return { ok: true, topQuestions: { minCount: config.minCount, topN: config.topN } };
}

export type QuestionConversationHit = {
  threadId: string;
  snippet: string;
  askedAt: string;
};

/** Drilldown: voorbeeldgesprekken waarin één van de varianten is gesteld. */
export async function getConversationsForQuestionAction(
  memberQuestions: string[],
): Promise<ActionResult<{ hits: QuestionConversationHit[] }>> {
  await pause(350);
  return { ok: true, hits: findFixtureConversationsForQuestions(memberQuestions ?? []) };
}

/** "Maak Q&A" vanuit de ranglijst (in het voorbeeld: alleen bevestigen). */
export async function addQAFromTopQuestionAction(
  question: string,
  answer: string,
): Promise<{ ok: boolean; error?: string }> {
  await pause(500);
  if (!question.trim() || !answer.trim()) return { ok: false, error: 'Vul een vraag en een antwoord in.' };
  return { ok: true };
}
