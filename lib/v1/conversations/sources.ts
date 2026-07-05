// V1 gespreks-bronnen — compacte, gedeelde vorm van de RAG-bronnen die per
// assistant-thread_message worden opgeslagen (write) en teruggelezen (read) voor
// het bronnen-paneel in het gesprek-detail (WP4.3).
//
// Pure module (GEEN 'server-only', geen supabase-import): zowel de service-role
// write-path als de client-side render-component importeren het type hieruit, en
// de twee helpers zijn los unit-testbaar (scripts/test-thread-message-sources.ts).

/** Eén opgeslagen bron: bestandsnaam/titel + (optioneel) bron-URL + similarity (0..1). */
export type ThreadMessageSource = {
  title: string;
  url?: string;
  similarity: number;
};

// Defensieve cap: `sources` is al de top-K gebruikte chunks uit de pipeline; deze
// cap houdt de jsonb-kolom compact mocht een bot ooit met een hogere top-K draaien.
// ponytail: vaste cap, geen config — het is een weergave-lijstje.
const MAX_SOURCES = 6;

/**
 * ChatResponse.sources (of gelijkvormig) → compacte opslag-vorm. Sorteert op
 * similarity aflopend en kapt op MAX_SOURCES zodat de sterkste bronnen de cap
 * overleven. Lege input → lege lijst (caller schrijft dan NULL).
 */
export function toThreadMessageSources(
  raw: ReadonlyArray<{ filename: string | null; url?: string | null; similarity: number }>,
): ThreadMessageSource[] {
  return raw
    .slice()
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_SOURCES)
    .map((s) => ({
      title: s.filename?.trim() || 'Bron',
      ...(s.url ? { url: s.url } : {}),
      similarity: Math.round(s.similarity * 1000) / 1000,
    }));
}

/**
 * jsonb uit thread_messages.sources → gevalideerde lijst, of null. Defensief:
 * user-rijen en oude assistant-rijen (vóór WP4.3) hebben NULL of een onverwachte
 * vorm → null zodat de UI geen paneel toont en niet crasht.
 */
export function parseThreadMessageSources(raw: unknown): ThreadMessageSource[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ThreadMessageSource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === 'string' ? rec.title : null;
    const similarity = typeof rec.similarity === 'number' ? rec.similarity : null;
    if (title === null || similarity === null) continue;
    const url = typeof rec.url === 'string' ? rec.url : undefined;
    out.push({ title, similarity, ...(url ? { url } : {}) });
  }
  return out.length > 0 ? out : null;
}
