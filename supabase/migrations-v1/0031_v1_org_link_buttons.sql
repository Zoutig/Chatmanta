-- 0031_v1_org_link_buttons.sql
-- Linkknoppen per klant (2026-10-14). Aan = de chatbot mag links geven, maar alléén als
-- de bezoeker om een document, download of plek op de site vraagt; de widget toont ze als
-- knop. Links komen uitsluitend uit de gecrawlde pagina's van de klant zelf (pagina-URL +
-- links op die pagina, zelfde domein) en gaan door een server-side sanitizer.
-- Standaard UIT voor elke org = hard rule 9 (geen bronlinks in V1) blijft de norm; dit is
-- een bewuste per-klant uitzondering (beslissing Seb 2026-10-14).
--
--   link_buttons_enabled — boolean NOT NULL DEFAULT false. Bestaande orgs krijgen false.
--
-- Geen RLS-wijziging: de bestaande organizations-policies (migr 0001) geven members alleen
-- SELECT op hun eigen org; er is geen UPDATE-policy, dus een klant kan de vlag niet zelf
-- zetten. De write loopt uitsluitend via een requireAdminActor-gegate admin-server-action
-- op de service-role (setOrgLinkButtonsAction). De chat- en embed-paden lezen de kolom via
-- lib/v1/org-flags/link-buttons.ts (fout of ontbrekende kolom → links uit). Zelfde
-- redenering als 0029_v1_org_fast_mode.sql.

alter table public.organizations
  add column link_buttons_enabled boolean not null default false;
