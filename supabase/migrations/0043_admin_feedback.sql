-- =============================================================================
-- Migration 0043 — admin_feedback: klant-meldingen / feedback-tickets
--
-- Een ingelogde dashboard-klant dient via /klantendashboard/feedback een
-- gestructureerde melding in (type, urgentie, beschrijving, optioneel
-- naam/e-mail/chat-ID/vraag/bijlage). Operator Niels beheert ze in de
-- "Feedback"-tab van het Admin Dashboard (lijst → detail → status + historie).
--
-- NIET te verwarren met public.v0_feedback (migratie 0031): dát is de 👍/👎-
-- rating per bot-antwoord (1-op-1 met query_log). Dit hier is een apart
-- ticket-/meldingssysteem.
--
-- ⚠️ RLS-MODEL — volgt bewust het admin_*-precedent (migraties 0038/0039), NIET
-- de "RLS overal" V1 hard rule:
--   * Dit is een operator-beheerde tickettabel; de status is NIET klant-zichtbaar
--     (bewuste productbeslissing). Geen tenant-leespad in V0.
--   * Geen RLS, geen organization_members-check. Toegang loopt UITSLUITEND via
--     proxy.ts (V0-gate) + requireV0Auth() (acties) + service-role wrappers
--     (lib/controlroom/server/feedback.ts).
--   * organization_id is een PLAIN uuid (GEEN FK): de V0-orgs zijn app-constants
--     (KNOWN_ORGS) met stabiele UUIDs. De insert-action zet de org server-side uit
--     de cookie (nooit client-payload). V1 kan FK + RLS additief toevoegen.
--
-- De CHECK-enums spiegelen de TS-unions in lib/controlroom/types.ts; bij elke
-- enum-wijziging moeten beide meegroeien.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. admin_feedback — één rij per ingediende melding.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_feedback (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source          text not null check (source in (
    'klantendashboard','widget','intern','systeem'
  )) default 'klantendashboard',
  type            text not null check (type in (
    'antwoordkwaliteit','bug','dashboard','feedback','wens'
  )),
  urgency         text not null check (urgency in ('low','normal','high')),
  -- Operator-prioriteit, los van de klant-urgency. Nullable: nog niet getrieerd.
  priority        text check (priority in ('low','normal','high','urgent')),
  status          text not null check (status in (
    'nieuw','in_behandeling','opgelost','gesloten'
  )) default 'nieuw',
  description     text not null check (char_length(description) between 10 and 8000),
  submitter_name  text check (submitter_name is null or char_length(submitter_name) <= 120),
  submitter_email text check (submitter_email is null or char_length(submitter_email) <= 200),
  chat_id         text check (chat_id is null or char_length(chat_id) <= 120),
  question        text check (question is null or char_length(question) <= 2000),
  -- Pad in de private Storage-bucket 'feedback-attachments' (org/feedback/naam).
  attachment_path text,
  attachment_name text check (attachment_name is null or char_length(attachment_name) <= 255),
  -- AVG-bewijs: gezet zodra naam/e-mail meekomt en de privacy-checkbox aan stond.
  privacy_accepted_at timestamptz,
  -- Snapshot van de indien-context (request-id, bot-versie, user-agent-hash, …).
  context         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Operator-inbox: alle meldingen op status, nieuwste eerst.
create index if not exists admin_feedback_status_idx
  on public.admin_feedback (status, created_at desc);

-- Per-org detail / filter.
create index if not exists admin_feedback_org_idx
  on public.admin_feedback (organization_id, created_at desc);

-- Hergebruik de gedeelde touch-trigger uit 0038 (admin_touch_updated_at()).
drop trigger if exists admin_feedback_touch on public.admin_feedback;
create trigger admin_feedback_touch
  before update on public.admin_feedback
  for each row execute function public.admin_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. admin_feedback_events — append-only historie: status-wijzigingen, comments
--    en interne notities. 'created' wordt bij insert geschreven; 'status_change'
--    bij elke operator-statuswijziging. comment/internal_note krijgen pas in
--    Fase 2 een UI, maar de kinds bestaan nu al zodat de tabel niet hoeft te
--    migreren.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_feedback_events (
  id          uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.admin_feedback(id) on delete cascade,
  kind        text not null check (kind in (
    'created','status_change','comment','internal_note'
  )),
  from_status text,
  to_status   text,
  body        text check (body is null or char_length(body) <= 4000),
  author      text not null check (author in ('klant','operator','systeem')) default 'operator',
  created_at  timestamptz not null default now()
);

create index if not exists admin_feedback_events_feedback_idx
  on public.admin_feedback_events (feedback_id, created_at);

-- ----------------------------------------------------------------------------
-- 3. Private Storage-bucket voor bijlagen. public=false → geen anonieme toegang;
--    de operator-detailpagina serveert via een kortlevende signed-URL uit een
--    service-role action. Geen storage.objects-policies nodig (service-role
--    bypast RLS); bewust GEEN public-policy zodat een pad-gok niets oplevert.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('feedback-attachments', 'feedback-attachments', false)
on conflict (id) do nothing;
