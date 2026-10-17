-- =============================================================================
-- Migration 0037 (V1) — leads_inzicht(): terugbelverzoeken (details.inkomend) tellen
-- niet mee als belpoging (zij belden ons, dat vertekent de opneemratio) maar apart als
-- 'terugbel'. Verder gelijk aan 0035. Alle cijfers van /v1/leads/inzicht in één ronde. Telt alleen activiteiten zonder ongedaan_op. Import-activiteiten
-- (soort 'import') tellen bewust niet mee: uitkomst onbekend, zou ratio's
-- vertekenen. Service-role only.
-- =============================================================================

create or replace function public.leads_inzicht(
  p_van  timestamptz,
  p_tot  timestamptz,
  p_user uuid default null
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select x.*
    from public.lead_activiteiten x
    where x.ongedaan_op is null
      and x.created_at >= p_van and x.created_at < p_tot
      and (p_user is null or x.user_id = p_user)
  ),
  b as (
    select a.*, l.niche, l.plaats,
           extract(isodow from a.created_at at time zone 'Europe/Amsterdam')::int as dow,
           extract(hour from a.created_at at time zone 'Europe/Amsterdam')::int as uur
    from a join public.leads l on l.id = a.lead_id
    where a.soort = 'belpoging'
      and coalesce(a.details->>'inkomend', '') <> 'true'
  ),
  mails as (
    select a.lead_id, a.created_at from a where a.soort = 'mail'
  )
  select jsonb_build_object(
    'belpogingen',    (select count(*) from b),
    'bedrijven',      (select count(distinct lead_id) from b),
    'opgenomen',      (select count(*) from b where uitkomst <> 'niet_opgenomen'),
    'interesse',      (select count(*) from b where uitkomst = 'interesse'),
    'terugbel',        (select count(*) from a where soort = 'belpoging' and details->>'inkomend' = 'true'),
    'kennismakingen', (select count(*) from a where soort = 'kennismaking'),
    'klanten',        (select count(*) from a where soort = 'status' and details->>'naar' = 'klant'),
    'mails',          (select count(*) from mails),
    'mail_naar_kans', (
      select count(distinct m.lead_id) from mails m
      where exists (
        select 1 from public.lead_activiteiten k
        where k.lead_id = m.lead_id and k.ongedaan_op is null
          and k.created_at > m.created_at and k.created_at <= m.created_at + interval '7 days'
          and (k.soort = 'kennismaking' or (k.soort = 'belpoging' and k.uitkomst = 'interesse'))
      )
    ),
    'per_dag', coalesce((
      select jsonb_agg(jsonb_build_object('dag', dag, 'belletjes', n, 'opgenomen', o, 'interesse', i) order by dag)
      from (
        select (created_at at time zone 'Europe/Amsterdam')::date as dag,
               count(*) n,
               count(*) filter (where uitkomst <> 'niet_opgenomen') o,
               count(*) filter (where uitkomst = 'interesse') i
        from b group by 1
      ) d
    ), '[]'::jsonb),
    'heatmap', coalesce((
      select jsonb_agg(jsonb_build_object('dow', dow, 'uur', uur, 'n', n, 'opgenomen', o))
      from (
        select dow, uur, count(*) n, count(*) filter (where uitkomst <> 'niet_opgenomen') o
        from b group by 1, 2
      ) h
    ), '[]'::jsonb),
    'per_niche', coalesce((
      select jsonb_agg(jsonb_build_object('naam', naam, 'belletjes', n, 'opgenomen', o, 'interesse', i, 'voorraad', v) order by n desc)
      from (
        select g.naam, g.n, g.o, g.i,
               (select count(*) from public.leads l2 where coalesce(l2.niche, 'onbekend') = g.naam and l2.status in ('open','terugbellen')) v
        from (
          select coalesce(bb.niche, 'onbekend') naam, count(*) n,
                 count(*) filter (where uitkomst <> 'niet_opgenomen') o,
                 count(*) filter (where uitkomst = 'interesse') i
          from b bb group by 1
        ) g
      ) x
    ), '[]'::jsonb),
    'per_plaats', coalesce((
      select jsonb_agg(jsonb_build_object('naam', naam, 'belletjes', n, 'opgenomen', o, 'interesse', i, 'voorraad', v) order by n desc)
      from (
        select g.naam, g.n, g.o, g.i,
               (select count(*) from public.leads l2 where coalesce(l2.plaats, 'onbekend') = g.naam and l2.status in ('open','terugbellen')) v
        from (
          select coalesce(bb.plaats, 'onbekend') naam, count(*) n,
                 count(*) filter (where uitkomst <> 'niet_opgenomen') o,
                 count(*) filter (where uitkomst = 'interesse') i
          from b bb group by 1
        ) g
      ) x
    ), '[]'::jsonb),
    'bezwaren', coalesce((
      select jsonb_agg(jsonb_build_object('bezwaar', bezwaar, 'n', n) order by n desc)
      from (
        select details->>'bezwaar' bezwaar, count(*) n
        from b where uitkomst = 'geen_interesse' and details->>'bezwaar' is not null
        group by 1
      ) z
    ), '[]'::jsonb),
    'per_beller', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', user_id, 'belletjes', n, 'opgenomen', o, 'interesse', i, 'kennismakingen', k) order by n desc)
      from (
        select bb.user_id, count(*) n,
               count(*) filter (where uitkomst <> 'niet_opgenomen') o,
               count(*) filter (where uitkomst = 'interesse') i,
               (select count(*) from a a2 where a2.user_id = bb.user_id and a2.soort = 'kennismaking') k
        from b bb group by 1
      ) y
    ), '[]'::jsonb),
    'pijplijn', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) n from public.leads group by 1) p
    )
  );
$$;

revoke execute on function public.leads_inzicht(timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.leads_inzicht(timestamptz, timestamptz, uuid) to service_role;
