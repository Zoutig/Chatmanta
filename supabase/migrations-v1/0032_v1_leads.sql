-- =============================================================================
-- Migration 0032 (V1) — leads-dashboard (/v1/leads): leads, lead_activiteiten,
-- lead_afzenders.
--
-- GESANCTIONEERDE UITZONDERING op hard rule 2 (organization_id NOT NULL): leads
-- zijn geen klantdata maar ChatManta's eigen verkoopdata (koude acquisitie).
-- Akkoord Sebastiaan 2026-10-16, zelfde categorie als audit_logs.
--
-- RLS AAN, GEEN policies (patroon 0017/0019): geen tenant-leespad. Alleen
-- bereikbaar via de service-role in server actions ná requireJorionAdmin().
-- Ontwerp: docs/superpowers/specs/2026-10-17-leads-dashboard-design.md
-- =============================================================================

create table if not exists public.leads (
  id                      uuid primary key default gen_random_uuid(),
  domein                  text,
  telefoon                text,
  bedrijfsnaam            text not null,
  website_url             text,
  niche                   text,
  plaats                  text,
  provincie               text,
  telefoons_extra         text[] not null default '{}',
  email                   text,
  emails_gevonden         text[] not null default '{}',
  contactpersoon          text,
  aanspreekvorm           text not null default 'je' check (aanspreekvorm in ('je','u')),
  haakje                  text,
  notitie                 text,
  google_rating           numeric,
  google_reviews          integer,
  heeft_chatbot           boolean,
  chatbot_naam            text,
  platform                text,
  woorden                 integer,
  score                   integer,
  score_max               integer,
  score_redenen           jsonb not null default '[]'::jsonb,
  score_voorlopig         boolean not null default true,
  labels                  text[] not null default '{}',
  status                  text not null default 'open' check (status in (
    'open','terugbellen','opvolgen','kans','klant','geen_interesse','niet_bellen','heeft_chatbot','archief'
  )),
  status_reden            text,
  volgende_actie_op       timestamptz,
  volgende_actie_notitie  text,
  pogingen_niet_opgenomen integer not null default 0,
  laatste_poging_op       timestamptz,
  kennismaking_op         timestamptz,
  opvolgmail_gestuurd_op  timestamptz,
  opvolgmail_situatie     text check (opvolgmail_situatie in ('info','test','kennis','klaar','herinnering')),
  geclaimd_door           uuid references public.users(id) on delete set null,
  geclaimd_tot            timestamptz,
  bron                    text not null,
  bron_data               jsonb not null default '{}'::jsonb,
  aangemaakt_door         uuid references public.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint leads_sleutel_aanwezig check (domein is not null or telefoon is not null)
);

create unique index if not exists leads_domein_uniek on public.leads (domein) where domein is not null;
create unique index if not exists leads_telefoon_uniek on public.leads (telefoon) where telefoon is not null;
create index if not exists leads_wachtrij_idx on public.leads (status, volgende_actie_op);
create index if not exists leads_niche_plaats_idx on public.leads (niche, plaats);

alter table public.leads enable row level security;

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch
  before update on public.leads
  for each row execute function public.v1_touch_updated_at();

create table if not exists public.lead_activiteiten (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  user_id      uuid references public.users(id) on delete set null,
  soort        text not null check (soort in ('belpoging','mail','notitie','status','kennismaking','import')),
  uitkomst     text check (uitkomst in ('niet_opgenomen','terugbellen','wil_mail','interesse','geen_interesse','niet_bellen')),
  details      jsonb not null default '{}'::jsonb,
  -- Stand-kolommen van de lead vóór deze actie (ongedaan maken).
  vorige_staat jsonb,
  ongedaan_op  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists lead_activiteiten_lead_idx on public.lead_activiteiten (lead_id, created_at desc);
create index if not exists lead_activiteiten_tijd_idx on public.lead_activiteiten (created_at);

alter table public.lead_activiteiten enable row level security;

create table if not exists public.lead_afzenders (
  user_id    uuid primary key references public.users(id) on delete cascade,
  naam       text not null,
  voornaam   text not null,
  functie    text not null default 'Oprichter',
  telefoon   text not null,
  email      text not null,
  foto_url   text,
  updated_at timestamptz not null default now()
);

alter table public.lead_afzenders enable row level security;

drop trigger if exists lead_afzenders_touch on public.lead_afzenders;
create trigger lead_afzenders_touch
  before update on public.lead_afzenders
  for each row execute function public.v1_touch_updated_at();

-- ----------------------------------------------------------------------------
-- leads_claim_volgende(): pakt ATOMAIR de volgende lead voor de belmodus en
-- zet hem op naam van p_user (FOR UPDATE SKIP LOCKED: twee bellers krijgen nooit
-- dezelfde). Eerst een eigen lopende claim (pagina herladen), dan terugbellen
-- die aan de beurt zijn, dan open leads op score.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- leads_opschonen(): AVG-bewaartermijn (12 maanden). Idempotent en goedkoop;
-- aangeroepen vanuit de app (hooguit 1x per dag per server-instance).
-- ----------------------------------------------------------------------------
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
      haakje = null, notitie = null, bron_data = '{}'::jsonb, score_redenen = '[]'::jsonb
  where status = 'niet_bellen'
    and updated_at < now() - interval '12 months'
    and bedrijfsnaam <> '(verwijderd)';
  get diagnostics v_kaal = row_count;

  delete from public.lead_activiteiten a
  using public.leads l
  where a.lead_id = l.id and l.bedrijfsnaam = '(verwijderd)';

  return v_weg + v_kaal;
end;
$$;

revoke execute on function public.leads_opschonen() from public, anon, authenticated;
grant execute on function public.leads_opschonen() to service_role;
