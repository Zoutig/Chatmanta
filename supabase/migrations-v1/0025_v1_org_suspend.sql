-- 0025_v1_org_suspend.sql
-- Operator-suspend (WP5c): een expliciete, eerlijke opschort-status voor een niet-
-- betalende of op te schorten klant. Nu kan een operator een org alleen stilzetten via
-- dagbudget=0, waarna bezoekers het MISLEIDENDE "daglimiet bereikt, probeer morgen" zien.
-- Deze kolom laat de gates in plaats daarvan een eerlijke "tijdelijk niet beschikbaar"-
-- melding tonen en de widget helemaal niet renderen.
--
--   suspended_at  — nullable timestamptz. NULL = actief, een tijdstempel = gesuspendeerd
--                   (sinds dat moment). Nullable timestamp i.p.v. een status-enum: er is
--                   maar één alternatieve toestand, dus YAGNI op een enum.
--
-- Geen RLS-wijziging: de bestaande organizations-policies (migr 0001) dekken member-reads;
-- de suspend/hervat-write loopt uitsluitend via een SA-1-gegate admin-server-action op de
-- service-role (Jorion is geen org-member → de RLS-session-client zou de org niet zien).
-- De chat-gates lezen de kolom via diezelfde service-role.

alter table public.organizations
  add column suspended_at timestamptz;
