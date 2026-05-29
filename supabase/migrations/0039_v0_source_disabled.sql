-- Migration 0039 — Bron-niveau actief/inactief op knowledge_sources (Admin Dashboard, taak 2).
--
-- disabled_at: NULL = actief; gezet = door de admin gedeactiveerd. "Inactief" is
-- expliciet NIET "verwijderd": een gedeactiveerde bron blijft bestaan en kan
-- worden heractiveerd, maar telt niet mee voor de bot. Verwijderen blijft de
-- harde delete (CASCADE → website_pages → document_chunks).
--
-- RETRIEVAL-UITSLUITING zonder RPC-wijziging: de admin-deactivatie-actie zet bij
-- deactiveren alle website_pages.included=false en bij heractiveren weer true.
-- De vector-search-RPC's (match_chunks_with_parents / match_chunks_hybrid, 0035)
-- filteren al op `website_pages.included = true AND deleted_at IS NULL`, dus een
-- gedeactiveerde bron valt automatisch buiten de retrieval. We raken de RPC's
-- hier bewust NIET aan (geen risico op de live RAG-laag).
--
-- knowledge_sources heeft al RLS (0032); een nullable kolom toevoegen raakt dat niet.

alter table public.knowledge_sources
  add column if not exists disabled_at timestamptz;

comment on column public.knowledge_sources.disabled_at is
  'Admin-deactivatie (Admin Dashboard). NULL = actief. Inactief != verwijderd (deleted_at). Retrieval-uitsluiting loopt via website_pages.included.';
