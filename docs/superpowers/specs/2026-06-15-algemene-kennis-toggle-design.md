# SPEC — Per-org toggle: algemene kennisvragen

**Branch:** `feat/seb/algemene-kennis-toggle` · **Datum:** 2026-06-15

## What

In het klantendashboard → **Instellingen** kan de klant aan/uit zetten of de chatbot
*algemene-kennisvragen* mag beantwoorden. Standaard staat dit **uit**.

Concreet stuurt deze toggle het bestaande "zero-hit general-knowledge"-pad: wanneer
retrieval géén relevante bron boven de drempel vindt, mag de bot bij **aan** een kort,
algemeen antwoord met disclaimer geven (*"Even kort: dit valt buiten onze specifieke
documentatie, maar in het algemeen…"*) in plaats van alleen de fallback. Antwoorden waar
de bronnen wél iets over zeggen blijven altijd brongebaseerd — die verandert deze toggle niet.

Bij het **aanzetten** verschijnt een bevestigingsmodal die uitlegt wat er verandert en wat
dat betekent. Uitzetten gebeurt direct, zonder modal.

## Achtergrond (waarom dit een gedragswijziging is)

Algemene-kennisantwoorden staan nu feitelijk **aan** in productie: het widget/embed-pad
stuurt geen `enableGeneralKnowledge`, dus `/api/v0/chat` valt terug op `true`, en de
nieuwste bot (v0.10) heeft `generalKnowledgeEnabled: true`. Deze feature maakt het per-org
configureerbaar met default **uit** voor iedereen (geen backfill) — wat de
anti-hallucinatie-houding aanscherpt. Beslist met Sebastiaan: uit voor iedereen, opt-in.

## Acceptance criteria

- [ ] `ChatbotSettings` heeft een veld `answerGeneralKnowledge: boolean`.
- [ ] Default = `false` voor alle 5 mock-orgs → ook bestaande orgs zonder DB-veld krijgen uit
      (partial-merge over mock-defaults).
- [ ] Settings-UI toont een toggle **"Mag de chatbot algemene kennisvragen beantwoorden?"**
      in sectie *Antwoordgedrag*.
- [ ] Toggle uit→aan opent een bevestigingsmodal met uitleg (wat verandert + wat dat betekent);
      **Annuleren** laat 'm uit, **Ja, toestaan** zet 'm aan (in form-state).
- [ ] Toggle aan→uit gebeurt direct, zonder modal.
- [ ] De gekozen waarde persisteert pas op **Instellingen opslaan** (zoals de rest van het
      formulier) en purget de answer-cache (bestaand `saveChatbotSettings`-gedrag).
- [ ] Widget/embed-pad: `enableGeneralKnowledge` volgt de org-instelling (default uit) wanneer
      de request-body geen expliciete waarde stuurt.
- [ ] Klantendashboard "Test chatbot"-scherm (`askTestQuestion`) spiegelt de org-toggle, zodat
      de klant-preview overeenkomt met de live widget (plan-review finding #2).
- [ ] Admin-testtool op `/admintool` (`chat-shell.tsx`) behoudt z'n expliciete per-request
      override (gedrag ongewijzigd) — een expliciete body-waarde wint van de org-setting.
- [ ] Bot-gedrag: bij **uit** + zero-hit → fallback-bericht (geen general-knowledge LLM-call);
      bij **aan** + zero-hit + `bot.generalKnowledgeEnabled` → de bestaande
      general/off_topic/fallback re-classify.
- [ ] `tsc` schoon; clean `next build` schoon.

## Out of scope

- GEEN migratie/backfill — default uit via mock-defaults (jsonb-veld, patroon migratie 0028).
- GEEN bredere wereldkennis bij vragen mét bron-hits (dat was optie B, afgewezen).
- GEEN wijziging aan de `/admintool`-UI-initialisatie (`chat-shell.tsx`) of de re-classify-prompt.
- GEEN wijziging aan bot-versie-config (`generalKnowledgeEnabled` blijft de capability-ceiling).

## Edge cases

- **Org zonder `v0_org_settings`-rij** → mock-default `false` → uit.
- **Corrupte/missende `chatbot.answerGeneralKnowledge` in jsonb** → partial-merge levert
  mock-default (`false`).
- **Bot-versie met `generalKnowledgeEnabled = false`** → toggle aan heeft geen effect
  (capability-ceiling); acceptabel, niet gerapporteerd als bug.
- **Body stuurt expliciet `enableGeneralKnowledge`** (testtool) → wint van org-setting.
- **Admin-dashboard SettingsForm** (gedeeld component) → toggle verschijnt en slaat daar ook op
  (org via route-param i.p.v. cookie). Parity gewenst — geen extra werk nodig.
