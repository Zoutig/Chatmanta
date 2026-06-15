# PLAN — Per-org toggle: algemene kennisvragen

Spec: `docs/superpowers/specs/2026-06-15-algemene-kennis-toggle-design.md`
Branch: `feat/seb/algemene-kennis-toggle` (off origin/main @ 298fa60)

## Task 1: `answerGeneralKnowledge` op ChatbotSettings + mock-default

- **Files:** `lib/v0/klantendashboard/types.ts`, `lib/v0/klantendashboard/mock/chatbot-settings.ts`
- **Approach:** Voeg `answerGeneralKnowledge: boolean;` toe aan `ChatbotSettings` in de
  *Antwoordgedrag*-groep (naast `honestAboutUnknown`). Zet `answerGeneralKnowledge: false` bij
  alle 5 mock-orgs. `getOrgSettings` doet al partial-merge van de mock-defaults over de
  jsonb-row → een org zonder het veld (alle bestaande orgs) krijgt `false`. **Geen migratie.**
- **Tests:** `tsc` schoon. Redenatie: org zonder DB-veld → mock-default `false`.

## Task 2: Wiring — overrides-passthrough + route-resolutie + klant-test-scherm

- **Files:** `lib/v0/klantendashboard/server/build-chatbot-overrides.ts`, `app/api/v0/chat/route.ts`,
  `app/klantendashboard/test/actions.ts`
- **Approach:**
  - `ChatbotPromptOverrides` krijgt `answerGeneralKnowledge: boolean` (mét JSDoc-regel, consistent
    met de andere velden — anders leest het als een vergeten prompt-injectie). `buildChatbotOverrides`
    normaliseert defensief: `answerGeneralKnowledge: settings.answerGeneralKnowledge === true`.
    Dat is fail-closed (uit) tegen een non-boolean jsonb-waarde uit een handmatige DB-edit
    (edge-case-lens gap a). Géén extra system-prompt-regel — de toggle stuurt de structurele gate
    in rag.ts, niet een instructie.
  - In `route.ts`: **verwijder** de huidige regel 187
    `const enableGeneralKnowledge = body.enableGeneralKnowledge !== false;` volledig (geen dode/
    dubbele binding → `noUnusedLocals`). Leg in plaats daarvan de *expliciete* body-waarde vast:
    `const explicitGeneralKnowledge = typeof body.enableGeneralKnowledge === 'boolean' ? body.enableGeneralKnowledge : undefined;`
    Ná de settings-load (waar `chatbotOverrides` al gezet wordt, regel ~343) resolven:
    `const enableGeneralKnowledge = explicitGeneralKnowledge ?? chatbotOverrides?.answerGeneralKnowledge ?? false;`
    Fail-closed bij onbekende org / getOrgSettings-fout (`chatbotOverrides` undefined → `false`) —
    bewust, conform anti-hallucinatie. Die waarde gaat naar `runRagQueryStreaming`.
  - In `app/klantendashboard/test/actions.ts` (`askTestQuestion`, finding #2): geef
    `enableGeneralKnowledge: chatbotOverrides.answerGeneralKnowledge` mee aan `runRagQueryStreaming`
    zodat de klant-preview de live-toggle spiegelt (nu valt het stil op rag.ts-default `true`).
  - rag.ts + eval.ts blijven ongewijzigd: `generalKnowledgeActive = bot.generalKnowledgeEnabled && enableGeneralKnowledge`.
- **Tests:** `tsc` schoon. Redenatie-matrix:
  - widget (geen body-GK) + org uit → `false` → fallback.
  - widget + org aan → `true` → re-classify (gated by bot).
  - klant-test-scherm + org uit → `false`; + org aan → `true` (spiegelt widget).
  - `/admintool` (expliciet `true`/`false`) → wint van org-setting.
  - non-boolean jsonb → `=== true` → `false` (fail-closed).

## Task 3: UI — toggle + bevestigingsmodal in SettingsForm

- **Files:** `app/klantendashboard/instellingen/components/settings-form.tsx`
- **Approach:** In sectie *Antwoordgedrag* een `Toggle` "Mag de chatbot algemene kennisvragen
  beantwoorden?" (default uit). De `onChange` routeert: `v === true` → open een bevestigingsmodal
  (`useState gkConfirmOpen`); `v === false` → `update('answerGeneralKnowledge', false)` direct.
  Modal volgt het bestaande patroon (qa-tab.tsx): `position:fixed; inset:0; rgba(0,0,0,.65)`
  overlay met `role="dialog" aria-modal="true"`, binnenin een `klant-card` (`--klant-bg-elev`),
  titel + uitleg-tekst (wat verandert / wat betekent dat), knoppen **Annuleren** (`klant-btn`)
  en **Ja, toestaan** (`klant-btn data-variant="primary"`). Confirm → `update('answerGeneralKnowledge', true)`
  + sluit. De waarde persisteert pas op **Instellingen opslaan** (bestaand form-gedrag → cache-purge).
  **Belangrijk:** alle modal-knoppen krijgen `type="button"` — het formulier submit op `onSubmit`→`save()`,
  dus een knop zonder expliciet type zou de save voortijdig triggeren (edge-case-lens #3).
- **Tests:** Browser (gate 5c): toggle aan opent modal; Annuleren laat uit; Ja zet aan; opslaan
  persisteert; toggle uit = direct. Light + dark + mobiel (≤900px drawer-shell).

## Volgorde & commits
1 → 2 → 3, elk een eigen commit (`feat(klantendashboard): …`). `tsc` na elke task.

## Open vragen
Geen scherpe open vragen — ontwerp + modal-copy zijn al met Sebastiaan afgestemd; modal-patroon
en wiring zijn geverifieerd tegen de actuele main.
