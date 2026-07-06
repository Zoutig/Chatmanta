-- 0024_v1_thread_message_sources.sql
-- WP4.3: bronnen-paneel in het V1-gesprek-detail. thread_messages (migr 0010)
-- krijgt een OPTIONELE `sources jsonb`-kolom die per assistant-bericht een
-- compacte lijst van de gebruikte RAG-bronnen draagt: per bron titel/bestandsnaam
-- + (optioneel) bron-URL + similarity. Zo kan de klant in het gesprek-detail zien
-- welke bron/pagina de bot voor een antwoord gebruikte (V0-pariteit).
--
-- Nullable, geen default: user-rijen én oude assistant-rijen (vóór deze feature)
-- houden NULL. De lees-/renderkant rendert dan geen paneel (defensief).
--
-- RLS: GEEN nieuwe policy nodig. RLS-policies gelden per-ROW, niet per-kolom — de
-- bestaande SELECT-policy thread_messages_select_org_members (migr 0010) dekt de
-- nieuwe kolom automatisch. Writes blijven service-role-only (er is bewust geen
-- INSERT/UPDATE-policy op thread_messages): appendTurn schrijft `sources` via de
-- service-role-client, de klant leest hem onder de bestaande membership-policy.
--
-- Vorm van de jsonb (informeel; geen CHECK — het is een weergave-lijstje dat de
-- app defensief pareert):
--   [{ "title": "faq.pdf", "url": "https://…", "similarity": 0.87 }, …]

alter table public.thread_messages
  add column if not exists sources jsonb;
