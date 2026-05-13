-- v0.5 general-knowledge toggle telemetry.
-- Nullable boolean: true = reclassify path ran, false = gated off, null = path not reached
-- (smalltalk, non-zero-hits answer, or legacy pre-migration rows).
ALTER TABLE query_log
  ADD COLUMN general_knowledge_actual boolean;

COMMENT ON COLUMN query_log.general_knowledge_actual IS
  'v0.5 general-knowledge gate outcome. true = reclassify ran; false = gated off via UI toggle or bot config; null = zero-hits path not reached.';
