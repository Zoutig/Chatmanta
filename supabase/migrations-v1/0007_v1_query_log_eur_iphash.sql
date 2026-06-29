-- M-A telemetrie: cost_eur (EUR-billing-cap M-C) + ip_hash (AVG, gepseudonimiseerd).
-- query_log heeft al RLS (SELECT org-members) + service-role-only writes; kolommen
-- toevoegen vereist geen nieuwe policy.
alter table public.query_log
  add column if not exists cost_eur numeric(10,6) not null default 0;
alter table public.query_log
  add column if not exists ip_hash text;
comment on column public.query_log.cost_eur is
  'EUR-kosten = cost_usd * vaste FX (USD_EUR_RATE). Backstop voor de per-org dag-budget-cap (M-C), geen factuur. Echte EUR-rates/live-FX = V2.';
comment on column public.query_log.ip_hash is
  'Gepseudonimiseerde bezoeker-IP (sha256+salt, getrunceerd). NULL voor authed dashboard-chat. AVG: nooit plain IP.';
