-- Widget allowed-domain allowlist per chatbot. Jorion-beheerd (geen klant-editor,
-- §1.5 #13) — de admin-deep-dive (M-D) krijgt de editor; in M-B via service-role/seed.
-- text[]; leeg/NULL = fail-open (geen lock), exact-match-na-normalisatie anders.
-- Kolom op bestaande RLS-tabel (chatbots) → geen nieuwe policy nodig; chatbots-writes
-- zijn service-role-only.
alter table public.chatbots
  add column if not exists allowed_domains text[];
comment on column public.chatbots.allowed_domains is
  'Toegestane parent-hosts voor de embed-widget (genormaliseerd, zonder www/scheme/port). NULL/leeg = geen lock (fail-open). Jorion-beheerd.';
