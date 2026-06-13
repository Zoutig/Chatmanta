# PLAN — WP3: answer_cache-invalidatie bij instellingen + repro item 10 (rev. na panel)

Spec: `docs/superpowers/specs/2026-06-13-wp3-settings-cache-purge-design.md`

> **Panel-synthese (3 lenzen + red-team):** purge verhuisd van per-call-site (4 actions) naar de
> gedeelde mutatie-laag in settings.ts — dekt klant- én admindashboard (controlroom.ts:241
> roept dezelfde saveChatbotSettings) én addQAFromTopQuestionAction. Scope-lens-advies "Q&A
> naar WP4" daarmee verworpen: in de lib-laag is Q&A-dekking 0 extra regels en de triage
> markeert cache-purge-bij-Q&A als must-fix die WP4's verificatie anders breekt. Task 3
> getrimd (autodetect-help bestaat al en klopt). FAQ-snapshot-bijwerking gedocumenteerd.

## Task 1: purgeAnswerCache-wrapper in rag.ts

- Files: `lib/v0/server/rag.ts`
- Approach: exporteer `purgeAnswerCache(organizationId: string): Promise<number | null>` naast
  `writeCachedAnswer`. Falsy-guard met throw (threads.ts:384-precedent: orgId verplicht, geen
  DEV_ORG_ID-default, lege string = programmeerfout). Eén
  `delete({ count: 'exact' }).eq('organization_id', orgId)` op `answer_cache` via rag.ts'
  bestaande `supabase()`-route (geen nieuwe client). Niet-throwend bij DB-fout:
  `console.warn('[cache] purge failed …')` + `null`; bij succes count + info-log.
- Tests: IO-functie — end-to-end bewezen in Task 4; typecheck bevestigt het count-op-delete-
  patroon (supabase-js v2 ondersteunt `delete({ count })`; faalt het type, dan
  `select` vooraf als fallback-patroon).

## Task 2: purge in de gedeelde mutatie-laag (settings.ts)

- Files: `lib/v0/klantendashboard/server/settings.ts`
- Approach: ná een geslaagde write purgen in `saveChatbotSettings`, `upsertQAItem`,
  `deleteQAItem` en `setQAActive` — orgId via de bestaande slug→KNOWN_ORGS-resolutie in die
  module. Awaiten (geen fire-and-forget: serverless kan de runtime na de response killen; de
  delete is enkele ms). Daarmee automatisch gedekt: klantendashboard-actions,
  admindashboard (`app/actions/controlroom.ts:241`) en `addQAFromTopQuestionAction`.
  `saveWidgetSettings` bewust niet. Import-richting checken: settings.ts → rag.ts mag geen
  cycle vormen (rag.ts importeert niets uit klantendashboard — verifiëren vóór de edit).
- Tests: typecheck + Task 4 (settings-save → cache-count 0); unit-suite blijft groen.

## Task 3: stale comment weg + UI-copy alleen-indien-nodig

- Files: `app/klantendashboard/instellingen/page.tsx` (comment regel ~4)
- Approach: verwijder de onjuiste "Save is mock-only"-comment. De autodetect-help in
  settings-form.tsx:151-156 blijkt al eerlijk ("Aan: bot spiegelt de taal van de bezoeker;
  Uit: bot blijft altijd in de hoofdtaal") — alleen aanpassen als de Task-4-repro een
  gedrag-copy-mismatch toont (bv. dat 'es' met autodetect aan stil genegeerd wordt verdient
  mogelijk één extra zin).
- Tests: visuele check (gate 5c).

## Task 4: repro item 10 met schone cache (gate, geen feature-werk)

- Files: geen (bevindingen → PR-body + triage-spec-update)
- Approach: op `dev-org`: (1) purge via wrapper (bewijst Task 1); (2) baseline-vraag →
  antwoord A; (3) toon wijzigen via saveChatbotSettings → zelfde vraag → géén cache-hit +
  stijlverschil; (4) primaryLanguage=es + autodetect uit → NL-vraag → Spaans antwoord
  (rag.ts:2323-2326-pad); (5) autodetect aan → NL-vraag → NL (by-design, documenteren);
  (6) answerLength kort vs uitgebreid → lengteverschil. ~4-6 gpt-4o-mini-calls (centen).
  Bevindingen voeden het taal-scope-advies aan Sebastiaan — besluit valt BUITEN dit pakket.
- Tests: dit ÍS de test.

## Gedocumenteerde bijwerkingen (in PR-body)

- Org-purge wist ook pre-cached FAQ-rijen → `v0_faq_snapshot.items.cachedAnswerId` kan
  dangling raken; "Gecached"-badge cosmetisch onjuist tot re-precache (no-op-veilig,
  regenereerbaar). Geaccepteerd; niet mee-clearen in dit pakket.
- KB-ingest-paden (quiz-antwoord, crawler, document-upload) purgen nog níét — hoort bij WP4;
  de spec-claim "elke antwoord-beïnvloedende mutatie" geldt binnen de settings/Q&A-laag.

## Volgorde & commits

1 → 2 → 3 → 4; commits: `fix(cache): purgeAnswerCache-wrapper`,
`fix(klantendashboard): cache-purge bij settings- en Q&A-mutaties`,
`chore(klantendashboard): stale mock-comment weg`. Gates: Codex-loop → clean build →
Playwright (instellingen-pagina) → eval-gate: lib/v0 geraakt maar gedrag-neutraal voor de
pipeline zelf (purge + comment); Task 4 is de gerichte smoke — hard-eval overkill,
afweging rapporteren.
