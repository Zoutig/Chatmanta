// Central RAG tuning knobs. All retrieval-augmented-generation thresholds
// live here so they can be tuned in one place and verified against
// per-customer testsets (blueprint sectie 16).
//
// IMPORTANT: never hardcode these values elsewhere — `import { RAG_CONFIG }
// from '@/lib/rag/config'` instead. Beginnersfout #16 in the blueprint
// (sectie 33) is exactly this kind of drift.
//
// V1 defaults are starting points, not final answers. Validate per customer
// during onboarding (blueprint sectie 17 testset evaluation).

export const RAG_CONFIG = {
  /** Tokens per chunk during document/page splitting. */
  CHUNK_SIZE: 500,
  /** Token overlap between adjacent chunks (continuity across boundaries). */
  CHUNK_OVERLAP: 50,
  /** Number of chunks to retrieve per vector search. */
  TOP_K: 5,
  /** Minimum cosine similarity for a chunk to be passed to the LLM.
   *  Below this threshold for ALL retrieved chunks → fallback path
   *  (no LLM call, return chatbot_settings.fallback_message). */
  SIMILARITY_THRESHOLD: 0.7,
  /** Hard cap on combined retrieved-chunk content sent as context. */
  MAX_CONTEXT_TOKENS: 4000,
  /** LLM temperature for answer generation — low = factual, less variation. */
  DEFAULT_TEMPERATURE: 0.2,
  /** Max tokens the LLM may generate in a response. */
  MAX_OUTPUT_TOKENS: 500,
} as const;
