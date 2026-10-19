// Whitelist voor de publieke widget-stream (security-audit 2026-10, bevinding 2).
//
// runRagQuery yieldt events met interne velden: opgehaalde chunks (contentExcerpt,
// parentExcerpt, bestandsnamen), totalCostUsd, threshold, botVersion, token-tellingen
// en fase-timings. De route gebruikt die server-side voor query_log en het transcript
// (finalResponse blijft volledig); naar een ANONIEME bezoeker gaat alleen wat een
// widget echt leest. Een onbekend event-kind valt weg (fail-closed): een nieuw veld of
// event moet hier bewust worden toegevoegd.
//
// Wat de consumenten lezen (geverifieerd okt 2026):
//   - app/embed-v1/[slug]/v1-widget.tsx: meta.queryLogId, answer-start (alleen kind),
//     answer-delta.text, {answer-done|smalltalk|fallback|replacement}.response.{kind,answer},
//     error (alleen kind).
//   - lib/voorbeeld/demo-chat.ts (demo /voorbeeld): idem, plus response.sources[].
//     {filename,url,similarity} bij een 'answer'-respons (bronnenlijst van de fictieve
//     demo-org). Alleen dáárvoor zet de demo-route `includeSourceTitles`.
//   - status.phase en followups-done.followUps leest nu geen widget, maar ze zijn
//     onschuldig en houden de stream bruikbaar voor een fase-indicator/vervolgvragen.
// De klant-preview (app/v1/app/preview) gebruikt de server-action askV1, niet deze stream.

const TERMINAL_KINDS = new Set(['answer-done', 'smalltalk', 'fallback', 'replacement']);

type Loose = Record<string, unknown>;

export type PublicStreamOptions = {
  /** Alleen de demo-route: bronTITELS (geen tekstfragmenten) bij een 'answer'. */
  includeSourceTitles?: boolean;
};

function publicSources(raw: unknown): { filename: string; url?: string; similarity: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { filename: string; url?: string; similarity: number }[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const src = s as Loose;
    if (typeof src.filename !== 'string' || !src.filename) continue;
    out.push({
      filename: src.filename,
      ...(typeof src.url === 'string' && src.url ? { url: src.url } : {}),
      similarity: typeof src.similarity === 'number' ? src.similarity : 0,
    });
  }
  return out;
}

function publicResponse(raw: unknown, opts: PublicStreamOptions): Loose {
  const r = raw && typeof raw === 'object' ? (raw as Loose) : {};
  const out: Loose = {};
  if (typeof r.kind === 'string') out.kind = r.kind;
  if (typeof r.answer === 'string') out.answer = r.answer;
  if (opts.includeSourceTitles && r.kind === 'answer') out.sources = publicSources(r.sources);
  return out;
}

/**
 * Engine-event → het deel dat naar de browser mag. null = niet versturen.
 * `requestId` gaat mee op error-events (supportreferentie, geen interne data).
 */
export function toPublicStreamEvent(
  event: { kind: string },
  requestId: string,
  opts: PublicStreamOptions = {},
): Loose | null {
  const e = event as Loose;
  switch (event.kind) {
    case 'status':
      return typeof e.phase === 'string' ? { kind: 'status', phase: e.phase } : { kind: 'status' };
    case 'answer-start':
      return { kind: 'answer-start' };
    case 'answer-delta':
      return { kind: 'answer-delta', text: typeof e.text === 'string' ? e.text : '' };
    case 'followups-done':
      return {
        kind: 'followups-done',
        followUps: Array.isArray(e.followUps)
          ? e.followUps.filter((f): f is string => typeof f === 'string')
          : [],
      };
    case 'error':
      return {
        kind: 'error',
        code: typeof e.code === 'string' ? e.code : 'INTERNAL',
        ...(typeof e.retryAfterSec === 'number' ? { retryAfterSec: e.retryAfterSec } : {}),
        requestId,
      };
    default:
      if (TERMINAL_KINDS.has(event.kind)) {
        return { kind: event.kind, response: publicResponse(e.response, opts) };
      }
      // metrics-done en elk onbekend event: alleen server-side.
      return null;
  }
}

/** Eén NDJSON-regel (met newline) of '' als het event niet naar buiten mag. */
export function publicStreamLine(
  event: { kind: string },
  requestId: string,
  opts?: PublicStreamOptions,
): string {
  const pub = toPublicStreamEvent(event, requestId, opts);
  return pub ? JSON.stringify(pub) + '\n' : '';
}
