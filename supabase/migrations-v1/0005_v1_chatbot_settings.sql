-- 0005_v1_chatbot_settings.sql
-- V1 klant chatbot-settings: één jsonb-kolom op chatbots (toon/taal/antwoordgedrag/
-- fallback/naam). Bewust GEEN 20 typed kolommen — de klant-dashboard ChatbotSettings
-- evolueert nog, en de RAG-engine leest een afgeleide (buildChatbotOverrides).
--
-- GEEN allowed_domains (widget-milestone). GEEN RLS-wijziging: de bestaande
-- chatbots_select_org_members-policy (0002) dekt member-reads van `settings`; writes
-- blijven service-role-only (er is geen UPDATE-policy → onder RLS geblokkeerd, zoals
-- bedoeld — de save-action schrijft via de V1 service-role na requireOrgMember).
--
-- NOG NIET TOEGEPAST. De organizer past 0005 toe op het V1-project (ref
-- tfijdnxqdvwzwgxdioqo) via Supabase MCP apply_migration + een handmatige
-- public._migrations-ledgerrij ná Seb's go (dev-machine pooler is geblokkeerd).

alter table public.chatbots
  add column settings jsonb not null default '{}'::jsonb;
