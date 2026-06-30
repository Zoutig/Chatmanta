-- 0011_v1_contact_requests.sql
-- V1 contactverzoeken: bezoeker -> klant lead-capture (port V0 0053).
--
-- Doel: detecteert de widget contact-intentie, dan vult de bezoeker een
-- formulier (naam, e-mail/telefoon, voorkeur, onderwerp, bericht, consent) ->
-- dit landt hier en verschijnt in de klantendashboard-tab "Contactverzoeken".
--
-- Her-gemodelleerd naar V1: chatbot_id NOT NULL toegevoegd (V0 had geen
-- chatbots-tabel); Engelse status-waarden (new/picked_up/handled); V0-cruft
-- (visitor_id, thread_id, updated_at + touch-trigger) weggelaten.
--
-- Hard rules: org+chatbot NOT NULL + FK; RLS aan + SELECT-policy (0001-patroon);
-- GEEN INSERT/UPDATE/DELETE-policy -> service-role-only writes.
--
-- /!\ ECHTE BEZOEKER-PII (naam/e-mail/telefoon van derden). consent_given CHECK=true
-- is de AVG-vangrail op DB-niveau -- geen rij zonder toestemming, ook niet via een
-- bug in de service-role-laag. Anders dan in V0 (waar de org-isolatie cosmetisch
-- was) IS de RLS-SELECT-policy hier de echte grens: V1 heeft per-user auth +
-- gevulde organization_members, dus org A kan de PII van org B niet lezen.
-- (Retentie / harde-delete na N dagen = app-laag, niet deze migratie.)

create table if not exists public.contact_requests (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  chatbot_id        uuid        not null references public.chatbots(id) on delete cascade,
  name              text        not null,
  email             text,
  phone             text,
  preferred_contact text        not null,
  subject           text,
  message           text,
  consent_given     boolean     not null,
  status            text        not null default 'new',
  notes             text,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint contact_requests_pref_chk        check (preferred_contact in ('call','email')),
  constraint contact_requests_status_chk      check (status in ('new','picked_up','handled')),
  constraint contact_requests_consent_chk     check (consent_given = true),
  -- minstens een manier om de bezoeker te bereiken (AVG/data-kwaliteit, ex-V0 0053).
  constraint contact_requests_contactinfo_chk check (email is not null or phone is not null),
  constraint contact_requests_name_len_chk    check (char_length(name) between 1 and 200),
  constraint contact_requests_subject_len_chk check (subject is null or char_length(subject) <= 300),
  constraint contact_requests_message_len_chk check (message is null or char_length(message) <= 4000),
  constraint contact_requests_notes_len_chk   check (notes is null or char_length(notes) <= 4000)
);

-- Tab-lijst + status-filter + nieuw-badge-count: org -> status -> recent eerst.
create index if not exists contact_requests_org_status_created_idx
  on public.contact_requests (organization_id, status, created_at desc);

alter table public.contact_requests enable row level security;
-- CREATE POLICY kent geen IF NOT EXISTS; plain create matcht 0002/0003.
create policy "contact_requests_select_org_members"
  on public.contact_requests for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = (select auth.uid())
    )
  );
-- Geen INSERT/UPDATE/DELETE policy: mutations via service-role.
