// Index-versie per chatbot (V1 migr 0030, chatbots.index_version): bepaalt hoe de
// kennisbank geknipt + geëmbed is, en dus met welk model de zoekvraag geëmbed moet worden
// en hoe de context gevuld wordt. Pure module — gedeeld door ingest, rag-config en scripts.
// Onderbouwing: ingest-onderzoek okt 2026 fase B (v0.14i3: zoekfouten −65%, hard-eval JA).
import type { RagConfig } from './types';
import type { EmbedModel } from './embeddings';

export type IndexVersion = 'v1' | 'v2';

export const INDEX_VERSIONS: readonly IndexVersion[] = ['v1', 'v2'];

export function isIndexVersion(v: unknown): v is IndexVersion {
  return v === 'v1' || v === 'v2';
}

/** Embeddingmodel van de index (chunks én zoekvraag én answer-cache). */
export function embedModelFor(v: IndexVersion): EmbedModel {
  return v === 'v2' ? 'text-embedding-3-large' : 'text-embedding-3-small';
}

/**
 * RAG-overrides per index-versie. v1 = ongewijzigd (top-8, 32k-cap uit LATEST).
 * v2 = context vullen tot 18k tekens: kopjes-secties zijn klein, dus top-8 levert maar
 * ±6k context (fase A: dan 10 pp slechter); met een tekenbudget wint v2.
 */
export function ragOverridesFor(v: IndexVersion): Partial<RagConfig> {
  if (v === 'v1') return {};
  return {
    embeddingModel: 'text-embedding-3-large',
    retrievalTopK: 60,
    finalContextMaxChunks: 60,
    maxContextChars: 18000,
  };
}
