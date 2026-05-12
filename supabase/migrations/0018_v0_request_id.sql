-- 0017_v0_request_id — correlation-ID per chat-request
--
-- Doel: elke /api/v0/chat request krijgt een korte ID (bv. 'chm_a1b2c3d4'). Bij
-- een error toont de widget die ID subtiel aan de eindgebruiker; Sebastiaan kan
-- met `select * from query_log where request_id = ?` exact terugvinden welke
-- query faalde en waarom.
--
-- Nullable kolom → bestaande rijen (vóór deze migration) blijven gewoon werken
-- met NULL. Geen backfill nodig.
--
-- Index voor snelle lookup wanneer een gebruiker een ID doorgeeft.

ALTER TABLE public.query_log
  ADD COLUMN IF NOT EXISTS request_id text NULL;

COMMENT ON COLUMN public.query_log.request_id IS
  'Correlation-ID per request (prefix chm_ + 8 hex chars). Subtiel zichtbaar in widget-errors, ingevuld door /api/v0/chat. NULL voor legacy rijen of paden die geen API-route doorlopen.';

CREATE INDEX IF NOT EXISTS query_log_request_id_idx
  ON public.query_log (request_id)
  WHERE request_id IS NOT NULL;
