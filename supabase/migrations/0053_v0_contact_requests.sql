-- =============================================================================
-- Migration 0053 — V0 contactverzoeken (bezoeker → ondernemer)
--
-- Doel: wanneer de widget-bot contact-intentie detecteert, biedt hij aan om
-- contact op te (laten) nemen. De bezoeker vult een formulier (naam, e-mail/
-- telefoon, toelichting, voorkeur bellen/mailen, consent) → dit landt hier en
-- verschijnt in de nieuwe klantendashboard-tab "Contactverzoeken". Per-org
-- aan/uit via de nieuwe `contact_requests` jsonb-kolom op v0_org_settings.
--
-- ⚠️ PII-NOOT (hard rule-afwijking, bewust + bevestigd voor de testfase):
--   Dit is de EERSTE V0-tabel die ECHTE derde-partij-PII opslaat (naam/e-mail/
--   telefoon van websitebezoekers). V0 heeft GEEN per-org-isolatie: de gedeelde
--   V0-cookie + `?org=`-param laten een ingelogde demo-bezoeker tussen orgs
--   switchen, en service-role bypasst RLS. De RLS-policy hieronder is daarom
--   V1-READY maar in V0 COSMETISCH. Echte isolatie komt in V0 van de CODE-LAAG:
--     * service-role-only writes via de submit-route
--     * verplichte organization_id-filter op elke read/update/delete
--     * org gebonden aan de gesigneerde slug-claim in het embed-token
--   Klant A kan in V0 via org-switch bij verzoeken van klant B → bewust
--   geaccepteerd voor de testfase. ECHTE per-org-auth (SA-1 + organization_members
--   membership-check) is een harde V1-blocker vóór productie. Zie AGENTS.md.
--
-- Ontwerpkeuzes:
--   * organization_id NOT NULL + ON DELETE CASCADE (hard rule: klantdata).
--   * thread_id nullable (ON DELETE SET NULL): de widget kent z'n thread_id niet
--     (grouping gebeurt server-side via visitorId in after()); de submit-route
--     resolvet 'm best-effort via findRecentThreadByVisitor. Voor de snelste
--     eerste-turn-submits bestaat de thread-row nog niet → thread_id blijft NULL.
--     De "link naar gesprek" in de tab rendert daarom null-safe.
--   * visitor_id NOT NULL: client-correlatiesleutel + dedup-sleutel.
--   * consent_given CHECK = true: AVG-vangrail op DB-niveau — geen rij zonder
--     toestemming, ook niet via een bug in de service-role-laag.
--   * PARTIAL UNIQUE (organization_id, visitor_id) WHERE deleted_at IS NULL:
--     max 1 ACTIEF verzoek per gesprek; ná wissen mag de bezoeker opnieuw. De
--     submit-route geeft idempotent 200 bij 23505-conflict.
--   * Retentie (migr-onafhankelijk, in lib/controlroom/server/retention.ts):
--     HARDE delete na 90 dagen (geen anonimisering — volledige PII-verwijdering).
--   * RLS aan + SELECT-policy voor org-members (V1-ready), 0031-patroon. Mutaties
--     via service-role wrappers vanuit app/api/v0/contact-request/route.ts en
--     lib/v0/klantendashboard/server/contact-requests-*.ts.
-- =============================================================================

create table public.v0_contact_requests (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  thread_id         uuid        null references public.v0_threads(id) on delete set null,
  visitor_id        text        not null,
  name              text        not null,
  email             text        null,
  phone             text        null,
  preferred_contact text        not null,
  subject           text        null,
  toelichting       text        null,
  consent_given     boolean     not null,
  status            text        not null default 'nieuw',
  notes             text        null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz null,
  constraint v0_contact_requests_pref_chk
    check (preferred_contact in ('call', 'email')),
  constraint v0_contact_requests_status_chk
    check (status in ('nieuw', 'opgepakt', 'afgehandeld')),
  constraint v0_contact_requests_consent_chk
    check (consent_given = true),
  constraint v0_contact_requests_contactinfo_chk
    check (email is not null or phone is not null),
  constraint v0_contact_requests_name_len_chk
    check (char_length(name) between 1 and 200),
  constraint v0_contact_requests_subject_len_chk
    check (subject is null or char_length(subject) <= 300),
  constraint v0_contact_requests_toel_len_chk
    check (toelichting is null or char_length(toelichting) <= 4000),
  constraint v0_contact_requests_notes_len_chk
    check (notes is null or char_length(notes) <= 4000)
);

-- Tab-lijst: alle verzoeken van deze org, recent eerst.
create index v0_contact_requests_org_created_idx
  on public.v0_contact_requests (organization_id, created_at desc);

-- Nieuw-badge-count + status-filter.
create index v0_contact_requests_org_status_idx
  on public.v0_contact_requests (organization_id, status);

-- Actieve-lijst + retentie skippen de soft-deleted rijen.
create index v0_contact_requests_org_active_idx
  on public.v0_contact_requests (organization_id, created_at)
  where deleted_at is null;

-- Max 1 ACTIEF verzoek per gesprek (visitor). Soft-deleted rijen tellen niet mee,
-- dus na handmatig/retentie-wissen kan dezelfde bezoeker opnieuw een verzoek doen.
-- De submit-route dedupliceert op het 23505-conflict van deze index (idempotent 200).
create unique index v0_contact_requests_unique_active_visitor_idx
  on public.v0_contact_requests (organization_id, visitor_id)
  where deleted_at is null;

-- updated_at auto-touch (zelfde patroon als 0028).
create or replace function public.v0_contact_requests_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists v0_contact_requests_touch_updated_at on public.v0_contact_requests;
create trigger v0_contact_requests_touch_updated_at
  before insert or update on public.v0_contact_requests
  for each row
  execute function public.v0_contact_requests_touch_updated_at();

alter table public.v0_contact_requests enable row level security;

-- SELECT: alleen org-members (V1-ready). In V0 COSMETISCH (zie PII-noot boven):
-- service-role bypasst dit + organization_members is leeg tot V1 Phase 1.
-- Mutaties lopen via service-role wrappers (geen INSERT/UPDATE/DELETE policy).
create policy "v0_contact_requests_select_org_members"
  on public.v0_contact_requests
  for select
  to authenticated
  using (
    organization_id in (
      select organization_id
      from public.organization_members
      where user_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- Per-org toggle + meldingsadres in v0_org_settings (jsonb, default UIT).
-- Vorm: { "enabled": boolean, "notificationEmail": string|null }.
-- Default '{}'::jsonb → de defensieve parser in settings.ts leest dat als
-- { enabled:false, notificationEmail:null } (opt-in, AVG-veilig). Gelezen/
-- geschreven via dedicated 1-koloms-upsert (zoals account/setup_skips/
-- widget_preview), NOOIT via writeOrgSettings.
-- -----------------------------------------------------------------------------
alter table public.v0_org_settings
  add column if not exists contact_requests jsonb not null default '{}'::jsonb;
