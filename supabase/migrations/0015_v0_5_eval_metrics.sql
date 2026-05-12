-- 0015_v0_5_eval_metrics — eval pipeline krijgt twee nieuwe judge-metrics
-- (route_correct, meta_talk_present) plus een category-veld op eval_questions
-- zodat de judge weet welk gedrag wordt verwacht.
--
-- Nullable kolommen → oude rijen blijven werken (NULL = "niet gemeten").

ALTER TABLE public.eval_questions
  ADD COLUMN IF NOT EXISTS category text NULL;

COMMENT ON COLUMN public.eval_questions.category IS
  'V0.5 — verwacht bot-gedrag voor route-correctness eval. Eén van: search, general, off_topic, smalltalk. NULL = niet ge-classificeerd (oude rijen).';

ALTER TABLE public.eval_runs
  ADD COLUMN IF NOT EXISTS score_route_correct boolean NULL,
  ADD COLUMN IF NOT EXISTS score_meta_talk_present boolean NULL;

COMMENT ON COLUMN public.eval_runs.score_route_correct IS
  'V0.5 — was de pre-process/fallback-classificatie correct (vs eval_questions.category)? NULL voor runs van vóór v0.5.';

COMMENT ON COLUMN public.eval_runs.score_meta_talk_present IS
  'V0.5 — bevat het antwoord "uit de context blijkt"-stijl meta-talk? Boolean per antwoord.';
