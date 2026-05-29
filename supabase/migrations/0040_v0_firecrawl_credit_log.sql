-- Migration 0040 — Firecrawl credit-logboek (Admin Dashboard, taak 7).
--
-- Account-breed verbruik van Firecrawl-credits, zodat het Admin Dashboard
-- "X / 1000 credits deze maand" kan tonen. Dekt de operaties die NIET in
-- crawl_events staan: map (sitemap-discovery), losse sitemap.xml-fetches en
-- single-page scrapes. De BATCH-crawl-credits staan al in crawl_events.credits_used
-- en worden DAAR afgeleid (per job de max) — die dubbelen we hier bewust niet.
--
-- organization_id is nullable: map/scrape/sitemap zijn account-breed (de Firecrawl-
-- wrappers hebben geen org-context) en de overview-metric is óók account-breed.
-- Geen FK. GEEN RLS: interne founder-tooling, alleen via service-role geschreven
-- (door de crawler) en gelezen (door het admin dashboard) — zelfde posture als
-- admin_*/cc_*. De log-helper is fail-safe: een log-fout mag een crawl nooit breken.

create table if not exists public.firecrawl_credit_log (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid,
  operation       text        not null,
  credits         int         not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists firecrawl_credit_log_created_idx
  on public.firecrawl_credit_log (created_at desc);

comment on table public.firecrawl_credit_log is
  'Account-breed Firecrawl-creditverbruik (map/sitemap/scrape). Batch-crawl-credits komen uit crawl_events.credits_used. Geen RLS: interne tooling, service-role only.';
