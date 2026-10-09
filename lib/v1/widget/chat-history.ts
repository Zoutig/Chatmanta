// Gespreksgeschiedenis voor de V1-widget en Preview. Pure functies.
//
// Een mislukte beurt (foutbubbel, of een antwoord dat nog loopt) gaat nooit mee
// als context: niet de foutbubbel zelf en ook niet de vraag waar hij bij hoort,
// anders blijft die vraag als losse "wees" in de geschiedenis hangen.

export type ChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
};

export type HistoryTurn = { role: 'user' | 'assistant'; content: string };

function failed(m: ChatTurn | undefined): boolean {
  return !!m && m.role === 'assistant' && (m.error === true || m.streaming === true || !m.content.trim());
}

/** Schone geschiedenis: alleen geslaagde vraag-antwoord-beurten. */
export function cleanHistory(turns: ChatTurn[]): HistoryTurn[] {
  const out: HistoryTurn[] = [];
  for (let i = 0; i < turns.length; i++) {
    const m = turns[i];
    if (m.role === 'user') {
      // Alleen een vraag mét geslaagd antwoord erachter; een losse vraag (geen
      // antwoord, of direct weer een vraag) gaat ook niet mee.
      const next = turns[i + 1];
      if (!next || next.role !== 'assistant' || failed(next)) continue;
      out.push({ role: 'user', content: m.content });
    } else if (!failed(m)) {
      out.push({ role: 'assistant', content: m.content });
    }
  }
  return out;
}

/**
 * Opnieuw proberen kan alleen op de laatste beurt: een foutbubbel als laatste
 * bericht, direct na de vraag. Geeft de vraag en de geschiedenis daarvóór terug.
 */
export function retryTarget(
  turns: ChatTurn[],
  errorId: string,
): { question: string; history: HistoryTurn[] } | null {
  const idx = turns.findIndex((m) => m.id === errorId);
  if (idx < 1 || idx !== turns.length - 1) return null;
  const err = turns[idx];
  const q = turns[idx - 1];
  if (err.role !== 'assistant' || !err.error || q.role !== 'user') return null;
  return { question: q.content, history: cleanHistory(turns.slice(0, idx - 1)) };
}

/** Is dit bericht de foutbubbel waarop "Opnieuw proberen" mag? */
export function isRetryable(turns: ChatTurn[], id: string): boolean {
  const last = turns[turns.length - 1];
  return !!last && last.id === id && last.role === 'assistant' && last.error === true;
}
