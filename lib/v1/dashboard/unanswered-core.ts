// V1 klant-dashboard: ÉÉN definitie van "onbeantwoord" (pure kern, testbaar).
//
// Definitie (oktober 2026):
//   - Een vraag is onbeantwoord als de chatbot er een fallback op gaf (query_log
//     kind='fallback'). Off-topic-weigeringen (category of gap_kind 'off_topic') tellen
//     NIET mee: die los je niet op met de kennisbank.
//   - Zachte weigeringen binnen kind='answer' tellen (nog) niet mee: gap_kind
//     'low_grounding'/'low_confidence' mengt echte weigeringen met gewone, herschreven
//     antwoorden, dus dat is uit de gelogde velden niet betrouwbaar af te leiden.
//   - Vragen worden gegroepeerd op een genormaliseerde sleutel (zelfde PII-redactie als
//     query_log, kleine letters, witruimte en slot-leestekens weg), zodat de vraag uit
//     het gesprek (ruwe tekst) en uit query_log (geredigeerd) dezelfde sleutel krijgen.
//
// "Afgehandeld" wordt afgeleid, zonder eigen kolom:
//   - 'answered': na de laatste fallback kreeg dezelfde vraag wél een antwoord;
//   - 'qa':       er is een actieve, ingelezen Q&A voor deze vraag, opgeslagen ná de
//                 laatste fallback (exacte sleutel of token-overlap, zoals de Q&A-matcher);
//   - 'resolved': het gesprek met de laatste fallback is "Markeer als opgelost"
//                 (threads.status='closed'). Een nieuwe fallback daarna heropent de vraag.
// Alle tellers (zijbalk, Overzicht, gesprekkenfilter, Meest gesteld, werklijst) lezen dit.

import { redactPii } from '@/lib/observability/redact';
import { findMatchingManualQA } from '@/lib/rag/manual-qa';

export const UNANSWERED_WINDOW_DAYS = 30;
/** Speling tussen query_log.created_at en threads.last_message_at (beide rond dezelfde beurt). */
const CLOSE_TOLERANCE_MS = 2 * 60 * 1000;

export type UnansweredStatus = 'open' | 'answered' | 'qa' | 'resolved';

export type LogRow = {
  question: string | null;
  kind: string | null;
  category?: string | null;
  gap_kind?: string | null;
  created_at: string | null;
};

export type QaRow = {
  id: string;
  question: string;
  active: boolean;
  ingested_document_id: string | null;
  updated_at: string | null;
  created_at?: string | null;
};

/** Eén fallback-beurt uit een gesprek: de bezoekersvraag + het gesprek eromheen. */
export type FallbackTurn = {
  threadId: string;
  question: string;
  at: string;
  threadClosed: boolean;
  threadLastMessageAt: string | null;
};

export type UnansweredQuestion = {
  key: string;
  /** De meest recente formulering (zoals gelogd). */
  question: string;
  occurrences: number;
  lastSeenAt: string;
  status: UnansweredStatus;
  /** Id van de Q&A die de vraag afhandelt (status 'qa'). */
  qaId: string | null;
  /** Er bestaat al een Q&A voor deze vraag, maar de bot wist het daarna nog niet. */
  qaExists: boolean;
  /** Gesprekken (nog open) waarin deze vraag een fallback kreeg. */
  threadIds: string[];
};

/** Sleutel om dezelfde vraag uit query_log en uit een gesprek samen te nemen. */
export function normalizeQuestionKey(text: string | null | undefined): string {
  return redactPii(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s?!.,;:…]+$/u, '')
    .trim();
}

export function isOffTopic(r: Pick<LogRow, 'category' | 'gap_kind'>): boolean {
  return r.category === 'off_topic' || r.gap_kind === 'off_topic';
}

/** Is deze query_log-rij een "onbeantwoord"-beurt? (fallback, geen off-topic) */
export function isUnansweredLogRow(r: LogRow): boolean {
  return r.kind === 'fallback' && !isOffTopic(r);
}

function ms(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

const STATUS_ORDER: Record<UnansweredStatus, number> = { open: 0, qa: 1, answered: 2, resolved: 3 };

export function deriveUnanswered(input: {
  logRows: LogRow[];
  qaItems: QaRow[];
  turns: FallbackTurn[];
}): UnansweredQuestion[] {
  type Acc = { question: string; occurrences: number; last: number; lastIso: string };
  const groups = new Map<string, Acc>();
  const answeredAt = new Map<string, number>();

  for (const r of input.logRows) {
    const key = normalizeQuestionKey(r.question);
    if (!key) continue;
    const t = ms(r.created_at);
    if (r.kind === 'answer') {
      answeredAt.set(key, Math.max(answeredAt.get(key) ?? 0, t));
      continue;
    }
    if (!isUnansweredLogRow(r)) continue;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { question: (r.question ?? '').trim(), occurrences: 1, last: t, lastIso: r.created_at ?? '' });
    } else {
      g.occurrences += 1;
      if (t > g.last) {
        g.last = t;
        g.lastIso = r.created_at ?? '';
        g.question = (r.question ?? '').trim() || g.question;
      }
    }
  }

  // Q&A-items als ManualQA voor de bestaande matcher (actief + ingelezen telt).
  const manual = input.qaItems.map((q) => ({
    id: q.id,
    question: q.question,
    answer: '',
    active: q.active && !!q.ingested_document_id,
    updatedAt: q.updated_at ?? q.created_at ?? '',
  }));

  // Per sleutel: open gesprekken + de laatste "opgelost"-markering.
  const openThreads = new Map<string, Set<string>>();
  const closedAt = new Map<string, number>();
  for (const turn of input.turns) {
    const key = normalizeQuestionKey(turn.question);
    if (!key) continue;
    if (turn.threadClosed) {
      const t = Math.max(ms(turn.threadLastMessageAt), ms(turn.at));
      closedAt.set(key, Math.max(closedAt.get(key) ?? 0, t));
    } else {
      const set = openThreads.get(key) ?? new Set<string>();
      set.add(turn.threadId);
      openThreads.set(key, set);
    }
  }

  const out: UnansweredQuestion[] = [];
  for (const [key, g] of groups) {
    let status: UnansweredStatus = 'open';
    let qaId: string | null = null;
    let qaExists = false;

    const exact = manual.find((m) => m.active && normalizeQuestionKey(m.question) === key);
    const match = exact ? { qa: exact } : findMatchingManualQA(g.question, manual);
    if (match) {
      qaExists = true;
      if (ms(match.qa.updatedAt) >= g.last) {
        status = 'qa';
        qaId = match.qa.id;
      }
    }
    if ((answeredAt.get(key) ?? 0) > g.last) status = 'answered';
    if (status === 'open' && (closedAt.get(key) ?? 0) + CLOSE_TOLERANCE_MS >= g.last && closedAt.has(key)) {
      status = 'resolved';
    }

    out.push({
      key,
      question: g.question,
      occurrences: g.occurrences,
      lastSeenAt: g.lastIso,
      status,
      qaId,
      qaExists: qaExists && status === 'open',
      threadIds: status === 'open' ? [...(openThreads.get(key) ?? [])] : [],
    });
  }

  return out.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      b.occurrences - a.occurrences ||
      b.lastSeenAt.localeCompare(a.lastSeenAt),
  );
}

export function openQuestions(qs: UnansweredQuestion[]): UnansweredQuestion[] {
  return qs.filter((q) => q.status === 'open');
}

/** Gesprekken met minstens één open onbeantwoorde vraag (badge + filter). */
export function threadsWithOpenQuestions(qs: UnansweredQuestion[]): Set<string> {
  const set = new Set<string>();
  for (const q of qs) if (q.status === 'open') for (const id of q.threadIds) set.add(id);
  return set;
}

/** Koppel fallback-assistentberichten aan de bezoekersvraag ervoor (zelfde gesprek). */
export function pairFallbackTurns(
  fallbacks: { thread_id: string; created_at: string }[],
  userMessages: { thread_id: string; content: string; created_at: string }[],
  threads: Map<string, { closed: boolean; lastMessageAt: string | null }>,
): FallbackTurn[] {
  const byThread = new Map<string, { content: string; t: number }[]>();
  for (const u of userMessages) {
    const list = byThread.get(u.thread_id) ?? [];
    list.push({ content: u.content, t: ms(u.created_at) });
    byThread.set(u.thread_id, list);
  }
  for (const list of byThread.values()) list.sort((a, b) => a.t - b.t);

  const turns: FallbackTurn[] = [];
  for (const f of fallbacks) {
    const thread = threads.get(f.thread_id);
    if (!thread) continue; // verwijderd of buiten scope
    const t = ms(f.created_at);
    const users = byThread.get(f.thread_id) ?? [];
    let question: string | null = null;
    for (const u of users) {
      if (u.t <= t) question = u.content;
      else break;
    }
    if (!question) continue;
    turns.push({
      threadId: f.thread_id,
      question,
      at: f.created_at,
      threadClosed: thread.closed,
      threadLastMessageAt: thread.lastMessageAt,
    });
  }
  return turns;
}
