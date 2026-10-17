-- =============================================================================
-- Migration 0034 (V1) — leads: AVG-opschoning strakker + claim-minuten begrensd.
--
-- Vervolg op 0032 (leads-dashboard). Twee functie-vervangingen, geen tabelwijziging:
--  1. leads_opschonen(): bij anonimisering van 'niet_bellen'-leads ook de overige
--     persoonsgebonden/operationele velden leegmaken (domein, telefoon, status en
--     status_reden blijven: die houden de niet-bellen-lijst waterdicht). De
--     activiteiten worden alleen verwijderd voor geanonimiseerde niet_bellen-leads
--     én alleen als ze ouder zijn dan 12 maanden.
--  2. leads_claim_volgende(): p_minuten begrensd op 1..60 (voorkomt eeuwige claims).
-- Ontwerp: docs/superpowers/specs/2026-10-17-leads-dashboard-design.md
-- =============================================================================

create or replace function public.leads_opschonen() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_weg integer;
  v_kaal integer;
begin
  delete from public.leads
  where status in ('geen_interesse','archief')
    and updated_at < now() - interval '12 months';
  get diagnostics v_weg = row_count;

  update public.leads
  set bedrijfsnaam = '(verwijderd)',
      website_url = null, niche = null, plaats = null, provincie = null,
      telefoons_extra = '{}', email = null, emails_gevonden = '{}', contactpersoon = null,
      haakje = null, notitie = null, bron_data = '{}'::jsonb, score_redenen = '[]'::jsonb,
      volgende_actie_notitie = null, labels = '{}', chatbot_naam = null,
      kennismaking_op = null, opvolgmail_gestuurd_op = null, opvolgmail_situatie = null,
      laatste_poging_op = null, geclaimd_door = null, geclaimd_tot = null,
      aangemaakt_door = null
  where status = 'niet_bellen'
    and updated_at < now() - interval '12 months'
    and bedrijfsnaam <> '(verwijderd)';
  get diagnostics v_kaal = row_count;

  delete from public.lead_activiteiten a
  using public.leads l
  where a.lead_id = l.id
    and l.status = 'niet_bellen'
    and l.bedrijfsnaam = '(verwijderd)'
    and a.created_at < now() - interval '12 months';

  return v_weg + v_kaal;
end;
$$;

revoke execute on function public.leads_opschonen() from public, anon, authenticated;
grant execute on function public.leads_opschonen() to service_role;

create or replace function public.leads_claim_volgende(
  p_user    uuid,
  p_niche   text default null,
  p_plaats  text default null,
  p_minuten integer default 10
) returns setof public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  p_minuten := greatest(1, least(coalesce(p_minuten, 10), 60));

  select l.id into v_id
  from public.leads l
  where l.geclaimd_door = p_user
    and l.geclaimd_tot > now()
    and l.status in ('open','terugbellen')
    and (p_niche is null or l.niche = p_niche)
    and (p_plaats is null or l.plaats = p_plaats)
  limit 1;

  if v_id is null then
    select l.id into v_id
    from public.leads l
    where l.status in ('open','terugbellen')
      and (l.volgende_actie_op is null or l.volgende_actie_op <= now())
      and (l.geclaimd_tot is null or l.geclaimd_tot < now() or l.geclaimd_door = p_user)
      and (p_niche is null or l.niche = p_niche)
      and (p_plaats is null or l.plaats = p_plaats)
    order by
      (l.status = 'terugbellen') desc,
      case when l.status = 'terugbellen' then l.volgende_actie_op end asc nulls last,
      l.score desc nulls last,
      l.google_reviews desc nulls last,
      l.created_at asc
    limit 1
    for update skip locked;
  end if;

  if v_id is null then
    return;
  end if;

  return query
    update public.leads
    set geclaimd_door = p_user,
        geclaimd_tot = now() + make_interval(mins => p_minuten)
    where id = v_id
    returning *;
end;
$$;

revoke execute on function public.leads_claim_volgende(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.leads_claim_volgende(uuid, text, text, integer) to service_role;
