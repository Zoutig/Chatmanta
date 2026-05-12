-- =============================================================================
-- Migration 0015 — V0 eval framework uitbreiding (adversarial + retrieval)
--
-- Voegt vijf concepten toe aan het eval-systeem:
--
--   1. conversation_history       — multi-turn vragen, voor planted-fact tests
--                                   waar een gebruiker eerder iets onwaars zegt
--                                   en de bot het naderhand niet mag napraten.
--   2. expected_kind              — verwacht bot-gedrag (answer/fallback/smalltalk);
--                                   voor adversarial vragen die fallback horen.
--   3. must_not_contain           — strings die NIET in het antwoord mogen staan.
--                                   Hard signal voor "bot is gevoelig voor user-
--                                   geplante leugens" detectie.
--   4. ideal_source_filenames     — voor retrieval-niveau metrics (recall@k, MRR)
--                                   los van de end-to-end judge scores.
--   5. question_type              — categorie zodat het rapport breakdowns kan
--                                   maken per type (out_of_corpus vs factual etc).
--
-- Plus zes nieuwe kolommen op eval_runs voor multi-run variance, retrieval-
-- metrics, citation-score (4e judge-dimensie) en must-not-violation flag.
--
-- Geen RLS-changes: nieuwe kolommen erven de policies van 0007.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- ALTER: eval_questions
-- -----------------------------------------------------------------------------
alter table public.eval_questions
  add column if not exists conversation_history jsonb not null default '[]'::jsonb,
  add column if not exists expected_kind        text,
  add column if not exists must_not_contain     text[] not null default '{}',
  add column if not exists ideal_source_filenames text[] not null default '{}',
  add column if not exists question_type        text not null default 'factual';

alter table public.eval_questions
  add constraint eval_questions_expected_kind_chk
    check (expected_kind is null or expected_kind in ('answer', 'fallback', 'smalltalk'));

alter table public.eval_questions
  add constraint eval_questions_question_type_chk
    check (question_type in (
      'factual',
      'multi_hop',
      'out_of_corpus',
      'false_premise',
      'prompt_injection',
      'typo',
      'planted_fact',
      'smalltalk',
      'ambiguous'
    ));

-- conversation_history shape-validatie: jsonb array van {role, content} objecten.
-- Lichte structurele check — we vertrouwen seed-script voor de details.
alter table public.eval_questions
  add constraint eval_questions_conversation_history_is_array_chk
    check (jsonb_typeof(conversation_history) = 'array');

comment on column public.eval_questions.conversation_history is
  'Turns vóór de eigenlijke `question`; format [{role:"user"|"assistant", content:string}]. Voor multi-turn / planted-fact tests.';
comment on column public.eval_questions.expected_kind is
  'Verwacht bot_kind: answer/fallback/smalltalk. NULL = geen verwachting (judge bepaalt op merites).';
comment on column public.eval_questions.must_not_contain is
  'Strings die niet in het bot-antwoord mogen voorkomen (case-insensitive, woordgrens-match). Bv. ["Frank"] voor planted-fact tests.';
comment on column public.eval_questions.ideal_source_filenames is
  'Bron-filenames die idealiter door retrieval worden opgehaald. Leeg = geen retrieval-metric (smalltalk/out-of-corpus).';
comment on column public.eval_questions.question_type is
  'Categorie voor per-type breakdown in eval-report.';


-- -----------------------------------------------------------------------------
-- ALTER: eval_runs
-- -----------------------------------------------------------------------------
alter table public.eval_runs
  add column if not exists run_index             int not null default 0,
  add column if not exists retrieved_filenames   text[] not null default '{}',
  add column if not exists retrieval_recall_at_k numeric(4,3),
  add column if not exists retrieval_mrr         numeric(4,3),
  add column if not exists score_citation        smallint,
  add column if not exists must_not_violation    boolean not null default false;

alter table public.eval_runs
  add constraint eval_runs_run_index_nonneg_chk
    check (run_index >= 0);

alter table public.eval_runs
  add constraint eval_runs_citation_range_chk
    check (score_citation is null or score_citation between 0 and 5);

alter table public.eval_runs
  add constraint eval_runs_recall_range_chk
    check (retrieval_recall_at_k is null or (retrieval_recall_at_k >= 0 and retrieval_recall_at_k <= 1));

alter table public.eval_runs
  add constraint eval_runs_mrr_range_chk
    check (retrieval_mrr is null or (retrieval_mrr >= 0 and retrieval_mrr <= 1));

-- Index voor multi-run variance queries en violations-overzicht in report.
create index if not exists eval_runs_org_violation_idx
  on public.eval_runs (organization_id, must_not_violation)
  where must_not_violation = true;

create index if not exists eval_runs_org_q_v_runidx
  on public.eval_runs (organization_id, question_id, bot_version, run_index);

comment on column public.eval_runs.run_index is
  'Index binnen multi-run batch (--runs=N). 0 = single-run default.';
comment on column public.eval_runs.retrieved_filenames is
  'Filenames van chunks die de bot ophaalde (gederiveerd uit sources).';
comment on column public.eval_runs.retrieval_recall_at_k is
  '|retrieved ∩ ideal| / |ideal|. NULL als ideal_source_filenames leeg.';
comment on column public.eval_runs.retrieval_mrr is
  '1 / positie eerste ideal in retrieved (0 als geen match). NULL als ideal leeg.';
comment on column public.eval_runs.score_citation is
  '4e judge-dimensie 0-5: zijn inline citations correct gekoppeld aan claims? NULL voor versies zonder citations of niet-answer kinds.';
comment on column public.eval_runs.must_not_violation is
  'TRUE als bot_answer een verboden string (must_not_contain) bevat — bv. user-geplante leugen wordt napraat.';
