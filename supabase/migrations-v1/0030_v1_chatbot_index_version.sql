-- 0030_v1_chatbot_index_version.sql
-- Ingest-onderzoek fase C (okt 2026): per chatbot vastleggen met welke knipwijze +
-- welk embeddingmodel de kennisbank is opgebouwd. De zoekvraag MOET met hetzelfde
-- model geëmbed worden als de index, dus de engine kiest model + retrieval-instellingen
-- op basis van deze kolom (app/v1/app/rag-config.ts, lib/rag/index-version.ts).
--
--   index_version — 'v1' = vaste-maat-knippen (3200/800) + text-embedding-3-small, top-8
--                   'v2' = knippen op kopjes + kruimelpad in de vector + text-embedding-3-large
--                          (1536 dims, zelfde vector(1536)-kolom) + context tot 18k tekens
--   Bestaande chatbots blijven 'v1' tot `npm run v1:reindex` ze omzet (per chatbot, in één
--   wissel: chunks vervangen → kolom → cache purgen). Nieuwe chatbots starten op 'v2'.
--
-- Geen RLS-wijziging: chatbots heeft alleen een member-SELECT-policy (0002); writes lopen
-- uitsluitend via de service-role (reindex-script / ingest), dus een klant kan de kolom
-- niet zelf omzetten.
--
-- Daarnaast: match_chunks_with_parents krijgt hnsw.ef_search = 200 + iterative scan
-- (pgvector 0.8). v2 vraagt 60 kandidaten op; met de default ef_search 40 kapt een
-- HNSW-indexscan dat vóór de org/chatbot-filters af op ≤ 40. Nu kiest de planner bij de
-- kleine V1-KB's nog een exacte sort; dit borgt het gedrag zodra de tabel groeit.

alter table public.chatbots
  add column index_version text not null default 'v1'
  check (index_version in ('v1', 'v2'));

alter table public.chatbots
  alter column index_version set default 'v2';

alter function public.match_chunks_with_parents(uuid, uuid, vector(1536), int)
  set hnsw.ef_search = 200;
alter function public.match_chunks_with_parents(uuid, uuid, vector(1536), int)
  set hnsw.iterative_scan = 'strict_order';
