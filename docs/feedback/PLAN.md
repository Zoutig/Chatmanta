# PLAN — Feedbacksysteem Fase 1

Sequentiële taken; elke taak ≈ één commit. Typecheck + relevante tests na elke taak.
Commit-stijl: `<type>(<scope>): <imperatief>` (NL).

## Task 1: migratie 0043 — tabellen + bucket
- Files: `supabase/migrations/0043_v0_feedback_reports.sql`
- Approach: twee tabellen (`admin_feedback`, `admin_feedback_events`) met CHECK-enums,
  indexen, RLS **uit** + `admin_*`-kop-comment (volg 0038/0039 letterlijk). In dezelfde
  migratie: `insert into storage.buckets (id, name, public) values
  ('feedback-attachments','feedback-attachments', false) on conflict do nothing;`.
  Geen storage.objects-policies (toegang = service-role only).
- Tests: `npm run migrate` + `npm run migrate:status` toont 0043; handmatige
  insert-smoke via datalaag in Task 2.

## Task 2: datalaag `lib/controlroom/server/feedback.ts`
- Files: `lib/controlroom/server/feedback.ts` (+ types), evt. `lib/controlroom/server/db.ts` hergebruik
- Approach: service-role via `sb()`. Functies: `createFeedback`, `listFeedback(filter)`,
  `getFeedback(id)`, `listFeedbackEvents(id)`, `getFeedbackSummary`, `setFeedbackStatus`,
  `addFeedbackEvent`, `uploadAttachment(orgId,feedbackId,file)`,
  `getAttachmentSignedUrl(path)`, `deleteFeedback`. Lees-functies gooien nooit → `[]`/null.
  `createFeedback` schrijft rij + `created`-event; `setFeedbackStatus` schrijft
  `status_change`-event + update `updated_at`.
- Tests: unit op mapping + validatie-helpers; insert/read round-trip (integratie, indien goedkoop).

## Task 3: klant-server-action + validatie
- Files: `app/klantendashboard/actions.ts` (nieuwe `submitFeedbackAction`),
  `lib/v0/feedback/validate.ts` (of inline)
- Approach: `actionTry` → `requireV0Auth` → `checkMutationLimit` →
  `getActiveOrgFromCookies` → valideer FormData (enums, lengtes, e-mailformaat,
  privacy-checkbox) → optioneel `uploadAttachment` (server-side MIME/size-allowlist) →
  `createFeedback`. Org NOOIT uit client. Retourneert `{ id }`.
- Tests: validatie-unit (enum/lengte/e-mail/bestand), permissie (geen cookie →
  AUTH_REQUIRED), org-injectie onmogelijk.

## Task 4: klant-formulier UI + bedankpagina + sidebar + config
- Files: `app/klantendashboard/feedback/page.tsx`,
  `app/klantendashboard/feedback/components/feedback-form.tsx`,
  `app/klantendashboard/feedback/verzonden/page.tsx` (of inline succes),
  `app/klantendashboard/components/sidebar.tsx` (NavItem),
  `next.config.*` (`serverActions.bodySizeLimit: '12mb'`)
- Approach: client-component template = `instellingen/components/settings-form.tsx`
  (`useState` + `useTransition` + sticky bar). File-input met client-side size/MIME-hint.
  Submit disabled tot verplicht geldig. Success → bedank-paneel/route.
- Tests: Playwright happy-path + validatie-blokkades (gate 5c).

## Task 5: admin lijst-pagina + sidebar + badge
- Files: `app/admindashboard/feedback/page.tsx`,
  `app/admindashboard/components/sidebar.tsx` (NavItem + open-count-badge)
- Approach: server component (`force-dynamic`), spiegel `issues/page.tsx`: health-strip
  (open-count via `getFeedbackSummary`), filter-chips (status/type/urgentie/org via
  `Link`+`buildHref`), rijen → detail-link. Badge in sidebar uit summary.
- Tests: Playwright lijst + filter (gate 5c).

## Task 6: admin detail-pagina + status-acties + historie + bijlage
- Files: `app/admindashboard/feedback/[id]/page.tsx`,
  `app/admindashboard/feedback/[id]/components/status-actions.tsx`,
  `app/actions/controlroom.ts` (`setFeedbackStatusAction`)
- Approach: server component → `getFeedback` + `listFeedbackEvents` +
  (indien bijlage) `getAttachmentSignedUrl`. Status-acties = client-component met
  `useTransition` (spiegel `issues/.../status-actions.tsx`), action in `controlroom.ts`
  (`actionTry`+`requireV0Auth`+`revalidate`). Historie-thread rendert events.
- Tests: Playwright statuswijziging reflecteert; bijlage-link werkt (gate 5c).

## Pre-PR gates
- 5a Codex review-and-fix loop (read-only) → triage → fix-commit(s)
- 5b `Remove-Item -Recurse -Force .next; npx next build` groen
- 5c Playwright: acceptatiecriteria in licht/donker + mobiel
- 5d Eval: **skip** — geen `lib/v0/`-pipelinewijziging (alleen UI/datalaag/migratie)
