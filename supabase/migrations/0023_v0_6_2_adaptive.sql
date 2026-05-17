-- 0023_v0_6_2_adaptive — V0.6.2 adaptive RAG telemetry kolommen
--
-- V0.6.2 (PR-B van de v0.6 split) introduceert:
--   * adaptive decision-layer met 3 paden (fast/standard/careful) — gateet
--     HyDE, rerank, cascade, claim-verify, followups selectief
--   * configurabele retrievalTopK / rerankInputMax / finalContextMaxChunks
--   * needsHistoryResolution heuristic voor multi-turn rewrite
--   * gap_kind classificatie (zero_hits / low_confidence / low_grounding /
--     off_topic) voor knowledge-gap snapshot
--
-- Twee nieuwe kolommen op query_log:
--   * gap_kind (text NULL) — verfijnde knowledge-gap classificatie
--   * adaptive_decision (jsonb NULL) — volledige RagDecision-blob voor
--     post-hoc analyse (path, retrievalStrength, shouldX booleans, reasonCodes)
--
-- Beide nullable: v0.1-v0.6.1 runs houden NULL. Eval-report kan straks per
-- adaptive_decision.path slicen (fast/standard/careful) om de latency/quality
-- trade-off per pad te zien.

ALTER TABLE public.query_log
  ADD COLUMN IF NOT EXISTS gap_kind text NULL,
  ADD COLUMN IF NOT EXISTS adaptive_decision jsonb NULL;

COMMENT ON COLUMN public.query_log.gap_kind IS
  'V0.6.2 — verfijnde knowledge-gap classificatie: zero_hits (geen chunks ≥ threshold), low_confidence (claimConfidence < threshold, regenerate-trigger), low_grounding (hardFactSupport.supported=false), off_topic (re-classifier OFF_TOPIC), NULL = geen gap. Gebruikt door knowledge-gap-snapshot voor fijnere classificatie dan kind=''fallback''.';

COMMENT ON COLUMN public.query_log.adaptive_decision IS
  'V0.6.2 — volledige RagDecision (path: fast/standard/careful, retrievalStrength, shouldUseHyDE/shouldRerank/shouldVerifyClaims/shouldRegenerateClaims/shouldCascade/shouldGenerateFollowupsInline booleans, reasonCodes). NULL voor v0.1-v0.6.1.';

-- Partial index voor gap-analyse: "welke queries hadden welke type gap?"
-- Kleine result-set (~5-15% van queries), partial index houdt het licht.
CREATE INDEX IF NOT EXISTS query_log_gap_kind_idx
  ON public.query_log (organization_id, bot_version, gap_kind, created_at DESC)
  WHERE gap_kind IS NOT NULL;
