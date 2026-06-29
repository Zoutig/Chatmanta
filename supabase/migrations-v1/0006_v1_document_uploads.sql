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
-- een client kan tegen de server-action liegen over de grootte. allowed_mime_types
-- beperkt tot de vier ondersteunde types; magic-bytes-validatie (server-side, na
-- download) is de extra defense-in-depth bovenop deze MIME-cap.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('v1-documents', 'v1-documents', false, 10485760,
  array['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'text/markdown'])
on conflict (id) do nothing;
