-- =============================================================================
-- Migration 0009 — V0.4 claim verification (data layer)
--
-- Doel: per gegenereerd antwoord splitten we de tekst in atomaire claims,
-- embedden elke claim, en vergelijken via cosine similarity met de chunk-tekst
-- die de LLM zag (parent_content bij parent-doc retrieval, anders chunk
-- content). Resultaat: per claim een verified-flag + best matching chunk +
-- similarity score. Per antwoord een aggregate claim_confidence (verified
-- ratio 0..1).
--
-- Niet-doel: LLM-judge of fact-checking — dat doet het eval-framework
-- (offline, duur). Claim verification draait inline op elke query (cheap).
--
-- Tabel claim_verifications staat los van extras.claims (jsonb in
-- query_log.response_json). Reden: queryable in SQL, joinable, indexed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- TABLE: claim_verifications
-- -----------------------------------------------------------------------------
create table public.claim_verifications (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  query_log_id    uuid        references public.query_log(id) on delete cascade,
  claim_index     int         not null,
  claim_text      text        not null,
  verified        boolean     not null,
  best_similarity numeric(6,4) not null,
  best_chunk_id   uuid        references public.document_chunks(id) on delete set null,
  threshold_used  numeric(4,2) not null,
  created_at      timestamptz not null default now(),
  constraint claim_verifications_index_chk check (claim_index >= 0),
  constraint claim_verifications_threshold_chk check (threshold_used between 0 and 1),
  constraint claim_verifications_text_len_chk check (char_length(claim_text) between 1 and 2000)
);

-- Per query alle claims ophalen (UI-rendering, debug).
create index claim_verifications_query_log_idx
  on public.claim_verifications (query_log_id);

-- Cross-query analyse (welke claims zijn überhaupt vaak ungrounded?).
create index claim_verifications_org_verified_idx
  on public.claim_verifications (organization_id, verified, created_at desc);

alter table public.claim_verifications enable row level security;

create policy "claim_verifications_select_org_members"
  on public.claim_verifications
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- Geen INSERT/UPDATE/DELETE policy: writes via service-role (log.ts).


-- -----------------------------------------------------------------------------
-- ALTER: query_log.claim_confidence
-- -----------------------------------------------------------------------------
-- Aggregate confidence per antwoord (verified count / total claim count).
-- 0..1. NULL als verification niet draaide voor deze query.
alter table public.query_log
  add column if not exists claim_confidence numeric(4,2);
