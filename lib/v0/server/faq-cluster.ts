// Gedeelde FAQ-clustering-core.
//
// Geëxtraheerd uit faq-snapshot.ts zodat zowel de admin-FAQ-engine
// (faq-snapshot.ts, bot-version-gepartitioneerd) als de klantendashboard-
// snapshot (lib/v0/klantendashboard/server/faq-klant.ts, version-agnostic)
// dezelfde clustering-wiskunde delen zonder de storage of bot_version-filtering
// te dupliceren. ALLEEN de math leeft hier — geen Supabase, geen embeddings.
//
// Pipeline (gedeeld):
//   - dedupeExact: exact-string dedupe (lowercase + trim) met member-variants.
//   - embedTexts (door de caller): unieke vragen → vectors.
//   - greedyCluster: greedy single-link clustering, cosine ≥ CLUSTER_THRESHOLD.

import 'server-only';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Cosine-similarity drempel voor "zelfde vraag, andere bewoording".
 *  Losser dan cache-hit (0.93) — daar willen we zekerheid, hier willen we
 *  paraphrasen samenvoegen tot één FAQ-entry. */
export const CLUSTER_THRESHOLD = 0.88;

// ---------------------------------------------------------------------------
// Cosine
// ---------------------------------------------------------------------------

export function cosine(a: number[], b: number[]): number {
  // OpenAI embeddings zijn al L2-normalised → dot-product == cosine.
  // Defensief: bereken explicit voor het geval een upstream-wijziging dat
  // breekt. n=1536 dus 3072 mults per vergelijking — verwaarloosbaar.
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

/** Exact-string-dedupe: lowercase + trim als key, behoud origineel-kapitaal
 *  in de output. Returnt unieke-vragen met hun samengevoegde metadata. */
export type DedupeEntry = {
  question: string;
  count: number;
  lastAsked: string;
  /** Alle exact-string varianten die in deze key vielen (geneerd voor
   *  member_questions[] op cluster-niveau). */
  variants: Set<string>;
};

export function dedupeExact(
  rows: Array<{ question: string; created_at: string }>,
): DedupeEntry[] {
  const map = new Map<string, DedupeEntry>();
  for (const r of rows) {
    const key = r.question.trim().toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (r.created_at > existing.lastAsked) {
        existing.lastAsked = r.created_at;
        existing.question = r.question.trim();
      }
      existing.variants.add(r.question.trim());
    } else {
      map.set(key, {
        question: r.question.trim(),
        count: 1,
        lastAsked: r.created_at,
        variants: new Set([r.question.trim()]),
      });
    }
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Greedy single-link clustering
// ---------------------------------------------------------------------------

/** Greedy single-link clustering — voor elk item: vergelijk met cluster-
 *  representatives, voeg toe aan eerste cluster met cosine ≥ threshold,
 *  anders nieuwe cluster. Niet-deterministisch in volgorde, maar wel
 *  reproducibel als input gesorteerd is op count desc. */
export type Cluster = {
  /** Index in `entries` van de representative (=eerste & meest-frequent). */
  repIdx: number;
  /** Member-indices in `entries`. */
  members: number[];
};

export function greedyCluster(
  entries: DedupeEntry[],
  vectors: number[][],
): Cluster[] {
  const clusters: Cluster[] = [];
  for (let i = 0; i < entries.length; i++) {
    let assigned = false;
    for (const c of clusters) {
      const sim = cosine(vectors[i], vectors[c.repIdx]);
      if (sim >= CLUSTER_THRESHOLD) {
        c.members.push(i);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusters.push({ repIdx: i, members: [i] });
    }
  }
  return clusters;
}
