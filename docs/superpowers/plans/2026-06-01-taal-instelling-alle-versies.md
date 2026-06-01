# Taal-instelling afdwingen over alle versies — condensed plan

> Vervolg op v0.9.3 (PR #164). Sebastiaan: "deze taal-fix moet voor ALLE versies
> gelden, want het is een instelling in klantendashboard." Correct — taalgedrag
> hoort bij de klant-configuratie (zoals toon/lengte), niet bij de bot-versie.

## Root cause (de échte)
De klantendashboard-config heeft al **`autoDetectLanguage` + `primaryLanguage`**.
`build-chatbot-overrides.ts` bouwde er al een `TAAL:`-instructie van — **maar zette
die in de system-prompt**, precies waar gpt-4o-mini 'm negeert (de NL `STIJL:`-suffix
komt erná → recency wint). De instelling was dus al die tijd stil dood, op élke versie.
De v0.9.3-flag `mirrorUserLanguage` was dubbel fout: versie-gebonden én hij negeerde
de instelling (forceerde Engels ook op orgs die op "altijd NL" stonden).

## Wijziging
Taal-afdwinging op de juiste laag: **runtime klant-instelling → user-turn directive**,
voor alle versies.
- `ChatbotPromptOverrides` krijgt `primaryLanguage` + `autoDetectLanguage` (structured).
- `rag.ts` bouwt de taal-directive in de USER-turn (ná de vraag, hoogste salience):
  - `autoDetectLanguage=false` → antwoord altijd in `primaryLanguage`.
  - `autoDetectLanguage=true` → spiegel de bezoeker (`detectLanguage`), val terug op
    `primaryLanguage` bij mixed/onbekend.
  - NL = natuurlijke model-default → directive vuurt alléén bij doeltaal ≠ NL.
  - Geen overrides (bv. eval) → default mirror, primaryLanguage 'nl'.
- Versie-flag `mirrorUserLanguage` verwijderd (type + V0_9_3 + test). v0.9.3 houdt z'n
  zachte system-prompt-reinforcement-blok (deployed, inert).
- Demo-orgs naar mirror: mock `acme-corp`+`initech` → `autoDetectLanguage:true`; in de
  **DB** stond alleen `acme-corp` nog op false → geflipt via `saveChatbotSettings`
  (`v0_org_settings` overruled de mock). `demo-nieuw` stond al op true (vandaar dat de
  "nieuwe demo" mirror-ON had maar tóch NL gaf — de afdwinging faalde).

## Files
- `lib/v0/klantendashboard/server/build-chatbot-overrides.ts` — structured taal-velden.
- `lib/v0/server/rag.ts` — instelling-gedreven user-turn taal-directive (alle versies).
- `lib/v0/server/bots.ts` — `mirrorUserLanguage`-flag weg; v0.9.3-comment/description bijgewerkt.
- `lib/v0/klantendashboard/mock/chatbot-settings.ts` — acme+initech → mirror.
- `scripts/test-bot-defaults.ts` — flag-asserts weg.

## Validatie (GEDAAN)
- `npm ci` + `tsc` clean; `test-bot-defaults` groen.
- Probe over versies (echte org-settings, ~$0,02): **5/5** — acme EN-vraag → Engels op
  **v0.6, v0.8.1, v0.9.3** (oude versies spiegelen óók); NL-vraag → NL; en met
  `autoDetectLanguage=false` → EN-vraag → NL (force-pad respecteert de instelling).
- DB-flip acme-corp `false→true` toegepast op prod-Supabase (V0 sandbox, reversibel).

## Eval-implicatie
De eval geeft geen overrides → default mirror → de 2 EN-cases passen op álle versies
(language-dimensie niet langer versie-discriminerend; bewust, want taal = infra/instelling).
