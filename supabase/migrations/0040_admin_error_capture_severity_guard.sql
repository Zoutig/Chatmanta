-- =============================================================================
-- Migration 0040 — admin_error_capture(): severity-downgrade-guard + resolved_at-fix
--
-- Review-bevindingen (round 1, adversariële review-loop):
--  * HIGH: de RPC deed `severity = excluded.severity` ONVOORWAARDELIJK op conflict.
--    Een externe/untrusted event op een bestaande fingerprint kon zo de severity
--    naar 'info' duwen → een echte 'error'-groep verdween uit de default Issues-
--    view (die op error+warning filtert) en werd retention-eligible. Fix: severity
--    mag alleen OMHOOG (info < warning < error), nooit omlaag.
--  * LOW: auto-reopen zette status terug op 'open' maar liet resolved_at staan
--    (inconsistent: open + niet-null resolved_at). Fix: resolved_at nullen bij reopen.
--
-- `create or replace` vervangt de functie uit 0039; de tabel blijft ongewijzigd.
-- =============================================================================

create or replace function public.admin_error_capture(
  p_fingerprint     text,
  p_organization_id uuid,
  p_surface         text,
  p_severity        text,
  p_code            text,
  p_title           text,
  p_message         text,
  p_context         jsonb
) returns void
language sql
as $$
  insert into public.admin_error_groups
    (fingerprint, organization_id, surface, severity, code, title, message, last_context)
  values
    (p_fingerprint, p_organization_id, p_surface, p_severity, p_code, p_title,
     p_message, coalesce(p_context, '{}'::jsonb))
  on conflict (fingerprint) do update set
    count        = public.admin_error_groups.count + 1,
    last_seen_at = now(),
    last_context = excluded.last_context,
    message      = excluded.message,
    title        = excluded.title,
    -- severity mag alleen omhoog — voorkomt dat een untrusted 'info'-event een
    -- echte 'error'/'warning'-groep verbergt (downgrade-hide-aanval).
    severity     = case
      when (case excluded.severity when 'error' then 3 when 'warning' then 2 else 1 end)
         > (case public.admin_error_groups.severity when 'error' then 3 when 'warning' then 2 else 1 end)
        then excluded.severity
        else public.admin_error_groups.severity
      end,
    -- auto-reopen van een afgehandelde groep + resolved_at opschonen.
    resolved_at  = case when public.admin_error_groups.status = 'resolved'
                        then null else public.admin_error_groups.resolved_at end,
    status       = case when public.admin_error_groups.status = 'resolved'
                        then 'open' else public.admin_error_groups.status end;
$$;
