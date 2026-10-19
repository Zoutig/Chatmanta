// V1 admin — gespreksdetail verrijken met de diagnose die bij elk bot-antwoord
// hoort (alleen lezen): cache-hit, latency, kosten, beste overeenkomst en de
// duim-feedback van de bezoeker.
//
// thread_messages en query_log hebben (nog) geen directe koppeling. Beide worden wel
// in dezelfde request weggeschreven (app/api/v1/chat/route.ts, after()), dus we
// koppelen op tijdstip + vraag. query_log.question is PII-geredacteerd met
// redactPii; daarom vergelijken we beide kanten ná diezelfde redactie. Komt de
// vraag niet overeen, dan geen koppeling, ook niet bij één kandidaat: een andere
// vraag wijst op een ander gesprek (liever niets dan het verkeerde).
//
// Een directe koppeling kan zonder migratie: de route kent queryLogId al vóór
// appendTurn, en thread_messages heeft een metadata-jsonb-kolom (migr V1 0010).
// Dat raakt wel het chatpad; deze heuristiek blijft dan de terugval voor oude berichten.
//
// matchQueryLogRows is PUUR (getest).

import { redactPii } from '@/lib/observability/redact';

export type QueryLogCandidate = {
  id: string;
  question: string;
  kind: string;
  createdAt: string;
};

export type AssistantTurn = {
  messageId: string;
  /** De bezoekersvraag direct vóór dit antwoord ('' als die ontbreekt). */
  question: string;
  kind: string | null;
  createdAt: string;
};

/** Max. afstand tussen query_log-rij en bericht. Beide worden ná de stream geschreven. */
export const MATCH_WINDOW_MS = 2 * 60 * 1000;

const norm = (s: string) => redactPii(s).trim().replace(/\s+/g, ' ').toLowerCase();

/** Koppelt elk bot-antwoord aan hooguit één query_log-rij (elke rij hooguit één keer). */
export function matchQueryLogRows(
  turns: AssistantTurn[],
  rows: QueryLogCandidate[],
): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const t of turns) {
    const tMs = Date.parse(t.createdAt);
    if (!Number.isFinite(tMs)) continue;
    const near = rows.filter((r) => {
      if (used.has(r.id)) return false;
      const rMs = Date.parse(r.createdAt);
      if (!Number.isFinite(rMs) || Math.abs(rMs - tMs) > MATCH_WINDOW_MS) return false;
      return t.kind == null || r.kind === t.kind;
    });
    if (near.length === 0) continue;
    const byDistance = (a: QueryLogCandidate, b: QueryLogCandidate) =>
      Math.abs(Date.parse(a.createdAt) - tMs) - Math.abs(Date.parse(b.createdAt) - tMs);
    if (!t.question) continue;
    const want = norm(t.question);
    const pick = near.filter((r) => norm(r.question) === want).sort(byDistance)[0];
    if (!pick) continue;
    used.add(pick.id);
    out.set(t.messageId, pick.id);
  }
  return out;
}

/** Leesbaar label voor thread_messages.kind / query_log.kind. */
export function answerKindLabel(kind: string | null): { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' } {
  switch (kind) {
    case 'answer':
      return { label: 'Beantwoord', tone: 'ok' };
    case 'fallback':
      return { label: 'Geen antwoord (fallback)', tone: 'warn' };
    case 'blocked':
      return { label: 'Geweigerd', tone: 'danger' };
    case 'smalltalk':
      return { label: 'Smalltalk', tone: 'neutral' };
    default:
      return { label: 'Onbekend', tone: 'neutral' };
  }
}
