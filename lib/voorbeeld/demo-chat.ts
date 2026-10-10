// Client-transport voor de demo-chat (/api/voorbeeld/chat). Leest de NDJSON-stream
// (zelfde events als /api/v1/chat) en meldt tekst-delta's + het eindresultaat.
// De instellingen gaan elke vraag mee: zo volgt de chatbot direct wat de bezoeker
// in het voorbeeld-dashboard aanpast.

import type { DemoSettings } from './demo-store';

export type DemoChatTurn = { role: 'user' | 'assistant'; content: string };

export type DemoSource = { title: string; url?: string; similarity: number };

export type DemoChatResult =
  | { ok: true; answer: string; kind: string; sources: DemoSource[] }
  | { ok: false; error: 'RATE_LIMITED' | 'FAILED' | 'THROWN' };

type StreamEvent = {
  kind?: string;
  text?: string;
  response?: {
    kind?: string;
    answer?: string;
    sources?: { filename?: string | null; url?: string | null; sourceUrl?: string | null; similarity?: number }[];
  };
};

function toSources(list: NonNullable<StreamEvent['response']>['sources']): DemoSource[] {
  const out: DemoSource[] = [];
  const seen = new Set<string>();
  for (const s of list ?? []) {
    const title = (s.filename ?? '').trim();
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const url = s.url ?? s.sourceUrl ?? undefined;
    out.push({ title, ...(url ? { url } : {}), similarity: typeof s.similarity === 'number' ? s.similarity : 0 });
  }
  return out.slice(0, 4);
}

export async function streamDemoChat(input: {
  question: string;
  history: DemoChatTurn[];
  settings: DemoSettings;
  onDelta?: (fullTextSoFar: string) => void;
  signal?: AbortSignal;
}): Promise<DemoChatResult> {
  let res: Response;
  try {
    res = await fetch('/api/voorbeeld/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: input.question,
        history: input.history.slice(-16),
        // Het logo (base64) is niet nodig voor het antwoord: niet meesturen.
        settings: { ...input.settings, customLogoDataUrl: null },
      }),
      signal: input.signal,
    });
  } catch {
    return { ok: false, error: 'THROWN' };
  }
  if (res.status === 429) return { ok: false, error: 'RATE_LIMITED' };
  if (!res.ok || !res.body) return { ok: false, error: 'FAILED' };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let final: DemoChatResult | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    let ev: StreamEvent;
    try {
      ev = JSON.parse(line) as StreamEvent;
    } catch {
      return;
    }
    if (ev.kind === 'answer-delta' && typeof ev.text === 'string') {
      text += ev.text;
      input.onDelta?.(text);
    } else if (
      ev.kind === 'answer-done' ||
      ev.kind === 'smalltalk' ||
      ev.kind === 'fallback' ||
      ev.kind === 'replacement'
    ) {
      const answer = ev.response?.answer ?? text;
      input.onDelta?.(answer);
      final = {
        ok: true,
        answer,
        kind: ev.response?.kind ?? ev.kind,
        sources: ev.response?.kind === 'fallback' ? [] : toSources(ev.response?.sources),
      };
    } else if (ev.kind === 'error') {
      final = final ?? { ok: false, error: 'FAILED' };
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        handle(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf('\n');
      }
    }
    handle(buffer);
  } catch {
    return text ? { ok: true, answer: text, kind: 'answer', sources: [] } : { ok: false, error: 'THROWN' };
  }

  if (final) return final;
  return text ? { ok: true, answer: text, kind: 'answer', sources: [] } : { ok: false, error: 'FAILED' };
}
