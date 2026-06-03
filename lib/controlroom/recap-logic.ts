// Maandelijkse Recap — PURE logica (geen DB, geen 'server-only'): maand-utilities
// + deterministische signaleringen. Apart van server/recap.ts zodat de drempel-
// logica unit-getest kan worden (lib/controlroom/__tests__/recap-signals.test.ts)
// en door zowel de server-reads als de UI hergebruikt kan worden.
//
// Spec: docs/superpowers/specs/2026-06-02-maandelijkse-recap-design.md

import {
  RECAP_SIGNAL_SEVERITY,
  type RecapSignalSeverity,
  type RecapSignalStatus,
  type RecapSignalType,
} from './types';

// Drempels (deterministisch). Vrij aanpasbaar; Niels kan ze later bijstellen.
/** Een specifieke vraag ≥ N× onbeantwoord → signaal ontbrekende_info. */
export const MISSING_INFO_THRESHOLD = 15;
/** Fallback-% boven deze grens → signaal kennisbank_incompleet. */
export const FALLBACK_PCT_THRESHOLD = 20;
/** Kantooruren [start, eind) in Europe/Amsterdam; piekuur erbuiten = inzicht. */
export const OFFICE_HOURS_START = 8;
export const OFFICE_HOURS_END = 18;

// ---------------------------------------------------------------------------
// Gedeelde datatypes (puur).
// ---------------------------------------------------------------------------

export type RecapStats = {
  totalConversations: number;
  /** Unieke widget-bezoekers (visitor_id not null); intern testverkeer telt niet mee. */
  uniqueVisitors: number;
  /** Proxy: gemiddelde van (updated_at − created_at) in seconden. */
  avgDurationSeconds: number;
  /** Gemiddeld aantal berichten (user + assistant) per gesprek. */
  avgMessagesPerConversation: number;
  /** Onbeantwoord = query_log-rijen met kind='fallback' in de maand. */
  unansweredCount: number;
  /** Totaal query_log-beurten in de maand (voor fallback-%). */
  totalTurns: number;
  /** Piekuur (0-23, Europe/Amsterdam) op basis van gesprek-STARTS; null bij 0 gesprekken. */
  peakHour: number | null;
};

export type RecapTopQuestion = { question: string; count: number; answered: boolean };
export type RecapUnanswered = { question: string; count: number };

export type RecapSignal = {
  type: RecapSignalType;
  severity: RecapSignalSeverity;
  message: string;
  status: RecapSignalStatus;
};

export const EMPTY_STATS: RecapStats = {
  totalConversations: 0,
  uniqueVisitors: 0,
  avgDurationSeconds: 0,
  avgMessagesPerConversation: 0,
  unansweredCount: 0,
  totalTurns: 0,
  peakHour: null,
};

// ---------------------------------------------------------------------------
// Maand-utilities (lokale-tijd grenzen, zelfde conventie als usage.ts).
// ---------------------------------------------------------------------------

/** 'YYYY-MM' voor (year, month=1-12). */
export function periodMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Parse 'YYYY-MM' → {year, month}; null bij ongeldig. */
export function parsePeriodMonth(period: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** [sinceIso, untilIso) voor één kalendermaand (until = 1e van de volgende maand). */
export function monthRangeIso(year: number, month: number): { sinceIso: string; untilIso: string } {
  const since = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const until = new Date(year, month, 1, 0, 0, 0, 0);
  return { sinceIso: since.toISOString(), untilIso: until.toISOString() };
}

/** Meest recente VOLLEDIG afgesloten kalendermaand (= vorige maand t.o.v. `now`). */
export function lastCompleteMonth(now = new Date()): { year: number; month: number } {
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12, huidige maand
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

/** Is (year, month) de lopende (nog onvolledige) kalendermaand? */
export function isCurrentMonth(year: number, month: number, now = new Date()): boolean {
  return year === now.getFullYear() && month === now.getMonth() + 1;
}

/** Uur 0-23 in Europe/Amsterdam uit een ISO-timestamp. */
export function amsterdamHour(iso: string): number {
  const parts = new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === 'hour')?.value ?? '0';
  return Number(h) % 24;
}

// ---------------------------------------------------------------------------
// Deterministische signaleringen — PURE functie (testbaar, geen LLM).
// ---------------------------------------------------------------------------

/**
 * Bereken de signaleringen puur uit de stats + onbeantwoorde-top. Alle drempels
 * zijn deterministisch; status defaultt op 'nieuw' (triage wordt later gemerged).
 *
 * korte_gesprekken (<30s) en lage_engagement (<2 berichten) zijn BEWUST geschrapt
 * t.o.v. Niels' MD — kort/weinig is doorgaans góéd voor een Q&A-kennisbot, en
 * duur is slechts een proxy. Zie de spec voor de onderbouwing.
 */
export function computeSignals(stats: RecapStats, topUnanswered: RecapUnanswered[]): RecapSignal[] {
  const signals: RecapSignal[] = [];
  const push = (type: RecapSignalType, message: string) =>
    signals.push({ type, severity: RECAP_SIGNAL_SEVERITY[type], message, status: 'nieuw' });

  if (stats.totalConversations === 0) {
    push('geen_gebruik', 'Er zijn deze maand geen gesprekken gevoerd met de chatbot.');
    return signals; // bij 0 gebruik zijn de andere signalen niet zinvol
  }

  const fallbackPct =
    stats.totalTurns > 0 ? Math.round((stats.unansweredCount / stats.totalTurns) * 100) : 0;
  if (fallbackPct > FALLBACK_PCT_THRESHOLD) {
    push(
      'kennisbank_incompleet',
      `${fallbackPct}% van de vragen kon niet worden beantwoord. Overweeg de kennisbank aan te vullen.`,
    );
  }

  const worst = topUnanswered[0];
  if (worst && worst.count >= MISSING_INFO_THRESHOLD) {
    push(
      'ontbrekende_info',
      `De vraag "${worst.question}" werd ${worst.count}× gesteld zonder inhoudelijk antwoord. Goede kandidaat voor de kennisbank.`,
    );
  }

  if (
    stats.peakHour != null &&
    (stats.peakHour < OFFICE_HOURS_START || stats.peakHour >= OFFICE_HOURS_END)
  ) {
    push(
      'gebruik_buiten_kantooruren',
      `Het piekuur is ${stats.peakHour}:00 — bezoekers stellen vooral buiten kantooruren vragen. Dit is een inzicht, geen probleem.`,
    );
  }

  return signals;
}

/** Zwaarste ernst onder een set signalen → de overzicht-bol (🟢/🟡/🔴). */
export function worstSeverity(signals: RecapSignal[]): RecapSignalSeverity | null {
  if (signals.some((s) => s.severity === 'actie_vereist')) return 'actie_vereist';
  if (signals.some((s) => s.severity === 'waarschuwing')) return 'waarschuwing';
  if (signals.some((s) => s.severity === 'inzicht')) return 'inzicht';
  return null;
}
