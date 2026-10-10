// Afgeleide cijfers over wat de bezoeker zelf in de demo deed (alles uit zijn
// eigen browser, demo-store). Pure functies: geen React, geen opslag.

import type { DemoConversation, DemoQAItem, DemoTurn } from './demo-store';

/** Oudere turns (van vóór de `unanswered`-vlag) vallen terug op kind 'fallback'. */
export function isTurnUnanswered(t: DemoTurn): boolean {
  return t.unanswered ?? t.kind === 'fallback';
}

export type OwnUnanswered = { question: string; count: number; lastAt: string };

export function normQuestion(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Vragen waarop de voorbeeldbot geen antwoord had (zie isTurnUnanswered), nieuwste
 * eerst. Een vraag waarvoor de bezoeker inmiddels zelf een Q&A schreef (via
 * "Antwoord geven", dus met precies die vraag) telt als opgelost.
 */
export function ownUnanswered(conversations: DemoConversation[], qa: DemoQAItem[] | null): OwnUnanswered[] {
  const solved = solvedByOwnQA(qa);
  const byKey = new Map<string, OwnUnanswered>();
  for (const c of conversations) {
    for (const t of c.turns) {
      if (!isTurnUnanswered(t)) continue;
      const key = normQuestion(t.question);
      if (!key || solved.has(key)) continue;
      const prev = byKey.get(key);
      if (prev) {
        prev.count += 1;
        if (t.at > prev.lastAt) prev.lastAt = t.at;
      } else {
        byKey.set(key, { question: t.question, count: 1, lastAt: t.at });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** Vragen (genormaliseerd) die de bezoeker zelf met een actieve Q&A beantwoordde. */
export function solvedByOwnQA(qa: DemoQAItem[] | null): Set<string> {
  return new Set((qa ?? []).filter((q) => q.own && q.active).map((q) => normQuestion(q.question)));
}

export type OwnActivity = {
  conversations: number;
  questions: number;
  answered: number;
  unanswered: number;
  ownQA: number;
};

export function ownActivity(conversations: DemoConversation[], qa: DemoQAItem[] | null): OwnActivity {
  const turns = conversations.flatMap((c) => c.turns);
  const unanswered = turns.filter(isTurnUnanswered).length;
  return {
    conversations: conversations.length,
    questions: turns.length,
    answered: turns.length - unanswered,
    unanswered,
    ownQA: (qa ?? []).filter((q) => q.own).length,
  };
}
