-- =============================================================================
-- Migration 0036 (V1) — leads_overzicht: leads + wie ze gebeld heeft.
-- Voor het filter "Gebeld door" en de kolom in de leadlijst (/v1/leads).
-- `gebeld_door` = alle gebruikers met een niet-ongedane belpoging op de lead.
-- security_invoker + revoke: zelfde dichte deur als de tabel (alleen service-role).
-- =============================================================================

create or replace view public.leads_overzicht
with (security_invoker = true)
as
select
  l.*,
  coalesce(
    (
      select array_agg(distinct a.user_id)
      from public.lead_activiteiten a
      where a.lead_id = l.id
        and a.soort = 'belpoging'
        and a.ongedaan_op is null
        and a.user_id is not null
    ),
    '{}'::uuid[]
  ) as gebeld_door
from public.leads l;

revoke all on public.leads_overzicht from public, anon, authenticated;
grant select on public.leads_overzicht to service_role;
