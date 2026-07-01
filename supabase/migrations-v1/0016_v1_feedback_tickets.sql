-- 0016_v1_feedback_tickets.sql
-- V1 klant-meldingen / feedback-tickets. Port van V0 0043 (admin_feedback*).
--
-- Een ingelogde dashboard-klant dient via /v1/app/feedback een gestructureerde
-- melding in (type, urgentie, beschrijving, optioneel naam/e-mail/chat-ID/vraag/
-- bijlage). De Jorion-admin beheert ze in de admin-feedback-inbox (lijst → detail
-- → status + historie).
--
-- NIET te verwarren met public.feedback (0012): dát is de 👍/👎-rating per
-- antwoord. Dit is een apart ticket-/meldingssysteem.
--
-- Anders dan V0 0043 (RLS-off admin_*): V1 hard rule = RLS overal. RLS staat AAN.
-- Bewust GEEN klant-SELECT-policy: de ticketstatus is (net als in V0) niet klant-
-- zichtbaar, en de feedback-pagina is submit-only (geen klant-lijst). RLS-aan +
-- geen policy = deny-all voor authenticated → alle reads/writes lopen via
-- service-role (klant-submit met requireOrgMember; admin-inbox met
-- requireJorionAdmin). organization_id is org-niveau (feedback gaat over het hele
-- account, niet één chatbot) — spiegelt admin_feedback (geen chatbot-scoping).

-- ===========================================================================
-- 1. v1_feedback_ticket -- één rij per ingediende melding.
-- ===========================================================================
create table if not exists public.v1_feedback_ticket (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  source          text        not null default 'klantendashboard',
  type            text        not null,
  urgency         text        not null,
  -- Operator-prioriteit, los van klant-urgency. Nullable: nog niet getrieerd.
  priority        text,
  status          text        not null default 'nieuw',
  description     text        not null,
  submitter_name  text,
  submitter_email text,
  chat_id         text,
  question        text,
  -- Pad in de private Storage-bucket 'v1-feedback-attachments'.
  attachment_path text,
  attachment_name text,
  -- AVG-bewijs: gezet zodra naam/e-mail meekomt en de privacy-checkbox aan stond.
  privacy_accepted_at timestamptz,
  context         jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint v1_feedback_ticket_source_chk   check (source in ('klantendashboard','widget','intern','systeem')),
  constraint v1_feedback_ticket_type_chk     check (type in ('antwoordkwaliteit','bug','dashboard','feedback','wens')),
  constraint v1_feedback_ticket_urgency_chk  check (urgency in ('low','normal','high')),
  constraint v1_feedback_ticket_priority_chk check (priority is null or priority in ('low','normal','high','urgent')),
  constraint v1_feedback_ticket_status_chk   check (status in ('nieuw','in_behandeling','opgelost','gesloten')),
  constraint v1_feedback_ticket_desc_chk     check (char_length(description) between 10 and 8000),
  constraint v1_feedback_ticket_name_chk     check (submitter_name is null or char_length(submitter_name) <= 120),
  constraint v1_feedback_ticket_email_chk    check (submitter_email is null or char_length(submitter_email) <= 200),
  constraint v1_feedback_ticket_chatid_chk   check (chat_id is null or char_length(chat_id) <= 120),
  constraint v1_feedback_ticket_question_chk check (question is null or char_length(question) <= 2000),
  constraint v1_feedback_ticket_attname_chk  check (attachment_name is null or char_length(attachment_name) <= 255)
);

create index if not exists v1_feedback_ticket_status_idx
  on public.v1_feedback_ticket (status, created_at desc);
create index if not exists v1_feedback_ticket_org_idx
  on public.v1_feedback_ticket (organization_id, created_at desc);

drop trigger if exists v1_feedback_ticket_touch on public.v1_feedback_ticket;
create trigger v1_feedback_ticket_touch
  before update on public.v1_feedback_ticket
  for each row execute function public.v1_touch_updated_at();

-- RLS aan, GEEN policy: status niet klant-zichtbaar; reads/writes via service-role.
alter table public.v1_feedback_ticket enable row level security;

-- ===========================================================================
-- 2. v1_feedback_ticket_event -- append-only historie (status, comments, notities).
-- ===========================================================================
create table if not exists public.v1_feedback_ticket_event (
  id          uuid        primary key default gen_random_uuid(),
  feedback_id uuid        not null references public.v1_feedback_ticket(id) on delete cascade,
  kind        text        not null,
  from_status text,
  to_status   text,
  body        text,
  author      text        not null default 'operator',
  created_at  timestamptz not null default now(),
  constraint v1_feedback_ticket_event_kind_chk   check (kind in ('created','status_change','comment','internal_note')),
  constraint v1_feedback_ticket_event_body_chk   check (body is null or char_length(body) <= 4000),
  constraint v1_feedback_ticket_event_author_chk check (author in ('klant','operator','systeem'))
);

create index if not exists v1_feedback_ticket_event_feedback_idx
  on public.v1_feedback_ticket_event (feedback_id, created_at);

-- RLS aan, GEEN policy: via service-role (admin-inbox).
alter table public.v1_feedback_ticket_event enable row level security;

-- ===========================================================================
-- 3. Private Storage-bucket voor bijlagen. public=false → geen anonieme toegang;
--    de admin-detailpagina serveert via een kortlevende signed-URL uit een
--    service-role action. Geen storage.objects-policies (service-role bypast RLS).
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('v1-feedback-attachments', 'v1-feedback-attachments', false)
on conflict (id) do nothing;
