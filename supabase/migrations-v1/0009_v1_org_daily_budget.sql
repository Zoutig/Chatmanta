-- M-C: per-org dag-budget-cap (EUR). Default €1/dag (Seb). Jorion/admin-instelbaar
-- (editor = M-D). De cap sommeert query_log.cost_eur sinds UTC-middernacht (M-A).
-- Backstop tegen kosten-explosie, geen factuur. Kolom op bestaande RLS-tabel
-- (organizations) → geen nieuwe policy: organizations-writes zijn service-role/
-- owner-gated (geen UPDATE-policy voor normale leden — zie 0001).
alter table public.organizations
  add column if not exists daily_budget_eur numeric(10,2) not null default 1.0;
comment on column public.organizations.daily_budget_eur is
  'Per-org dag-budget in EUR (cap op query_log.cost_eur sinds UTC-middernacht). Default 1.0. Admin-instelbaar (M-D).';
