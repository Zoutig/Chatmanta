-- =============================================================================
-- Migration 0006 — v1-documents: private Storage-bucket voor klant-document-uploads
--
-- De ingelogde klant uploadt PDF/DOCX/TXT/MD (≤10MB) via een signed upload-URL
-- (§1.5 #5). De service-role maakt de signed upload-URL aan + downloadt het bestand
-- voor de ingest; uploadToSignedUrl is token-geautoriseerd (geen sessie nodig op de
-- Storage-call). Na succesvolle ingest verwijdert de server het originele bestand —
-- de chunks zijn de source of truth (AVG-clean, geen ruwe-bestand-store).
--
-- GEEN storage.objects-policies (mirror V0 0043 feedback-attachments): de service-role
-- bypast RLS en het upload-token is per-upload — een pad-gok levert niets op. Het pad
-- is bovendien server-gegenereerd als `<orgId>/<chatbotId>/<uuid>-<naam>`, en de
-- verwerk-action her-valideert dat een pad in de eigen org/chatbot-namespace ligt.
--
-- file_size_limit (10MB) wordt door Storage zelf afgedwongen — de STERKE cap, want
-- een client kan tegen de server-action liegen over de grootte.
--
-- GEEN allowed_mime_types op de bucket: uploadToSignedUrl negeert de contentType-optie
-- voor een browser-File en stuurt het File-eigen file.type. Voor .md is dat vaak leeg
-- → application/octet-stream → buiten elke MIME-allowlist → Storage weigert (400) vóór
-- de ingest. Het type-filter draait daarom volledig server-side: de ext-allowlist
-- (ALLOWED_DOC_EXT) bij het maken van de signed URL + magic-bytes-validatie na download.
-- Samen met de Storage file_size_limit is dat de volledige upload-validatie.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('v1-documents', 'v1-documents', false, 10485760)
on conflict (id) do nothing;
