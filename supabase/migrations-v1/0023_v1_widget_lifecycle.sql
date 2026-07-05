-- 0023_v1_widget_lifecycle.sql
-- Widget-levenscyclus (WP2, dashboard-gaps-plan): klant-pauzeerbare widget +
-- heartbeat-registratie, zodat "geïnstalleerd" echt betekent dat de widget laadt.
--
-- Kolommen op chatbots (één actieve bot per org, zie chatbots_one_active_per_org):
--   is_active               — klant-toggle: false = embed rendert geen widget én
--                             /api/v1/chat weigert vriendelijk (defense in depth)
--   widget_last_seen_at     — laatste heartbeat-ping vanaf een geladen embed-iframe
--   widget_last_seen_origin — display-only host van de ouderpagina (strikt gevalideerd
--                             in de ping-route, zie cleanHost)
--
-- Geen RLS-wijziging: de bestaande chatbots_select_org_members-policy (0002) dekt
-- member-reads van deze kolommen; writes lopen uitsluitend via service-role
-- (SA-1-gegate server action voor de toggle + de token-gegate ping-route).

alter table public.chatbots
  add column is_active               boolean     not null default true,
  add column widget_last_seen_at     timestamptz,
  add column widget_last_seen_origin text;
