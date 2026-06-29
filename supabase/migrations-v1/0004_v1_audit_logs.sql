-- 0004_v1_audit_logs.sql
-- V1 M1 (onboarding-fundament) — audit_logs.
--
-- The only net-new table for M1: orgs/users/members/chatbots already exist
-- (0001/0002). Internal audit trail for admin mutations (org.create, invites, …).
--
-- Hard rules:
--   * organization_id + user_id are NULLABLE (the sanctioned hard-rule exception —
--     same class as users/audit_logs in the blueprint) with ON DELETE SET NULL so a
--     deleted org/user does not cascade-erase its own audit history.
--   * RLS ON, NO policy → service-role-only. Mirrors firecrawl_credit_log (0003):
--     no per-user/per-org reader in V1; staff read via Supabase Studio. A missing
--     policy means: blocked under RLS; service-role bypasses it.
--
-- NOT applied by the implementer. The organizer applies 0004 to the V1 project
-- (ref tfijdnxqdvwzwgxdioqo) via Supabase MCP apply_migration + a manual
-- public._migrations ledger row (dev-machine pooler is blocked), after Seb's go.

create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id         uuid references public.users(id) on delete set null,
  action          text not null,
  target_type     text,
  target_id       uuid,
  ip_hash         text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

alter table public.audit_logs enable row level security;
-- geen policies: service-role-only (interne audit; klant/admin heeft geen v1-UI)

create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
