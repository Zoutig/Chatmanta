-- Klant-limieten in vragen i.p.v. euro's (feedback Niels, okt 2026).
--
-- De klant ziet voortaan alleen vragen: "X van 250 vandaag" en "X van 2000 deze
-- maand". Een vraag = één query_log-rij (V1 kent geen gesprek-entiteit). Beide
-- limieten zijn per org instelbaar in het admin-dashboard; 0 = bot dicht.
--
-- Het EUR-dagbudget (daily_budget_eur, migr 0009) blijft bestaan als onzichtbaar
-- kosten-vangnet (alleen admin). Default €1 → €2: 250 vragen kosten normaal ~€0,25
-- (gem. ~€0,001/vraag), maar een dag met veel gpt-4o-cascades (~€0,011/vraag) mag
-- het vangnet niet eerder laten dichtklappen dan de vragen-limiet die de klant ziet.
-- Orgs die nog op de oude default (€1) staan schuiven mee; afwijkend ingestelde
-- waarden blijven staan.
--
-- Kolommen op een bestaande RLS-tabel → geen nieuwe policy. organizations heeft
-- alleen een SELECT-policy voor leden (0001); writes lopen via service-role in de
-- admin-actions, dus een klant kan zijn eigen limiet niet ophogen.

alter table public.organizations
  add column if not exists daily_question_limit integer not null default 250
    constraint organizations_daily_question_limit_range check (daily_question_limit between 0 and 100000),
  add column if not exists monthly_question_limit integer not null default 2000
    constraint organizations_monthly_question_limit_range check (monthly_question_limit between 0 and 1000000);

comment on column public.organizations.daily_question_limit is
  'Max aantal vragen (query_log-rijen) per UTC-dag. Default 250. 0 = dicht. Admin-instelbaar.';
comment on column public.organizations.monthly_question_limit is
  'Max aantal vragen (query_log-rijen) per kalendermaand (UTC). Default 2000. 0 = dicht. Admin-instelbaar.';

alter table public.organizations
  alter column daily_budget_eur set default 2.0;

update public.organizations
  set daily_budget_eur = 2.0
  where daily_budget_eur = 1.0;

comment on column public.organizations.daily_budget_eur is
  'Intern kosten-vangnet in EUR per UTC-dag (som query_log.cost_eur). Default 2.0. Niet zichtbaar voor de klant. Admin-instelbaar.';
