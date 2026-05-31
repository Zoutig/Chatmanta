# Productie-gate Eval — Laag 4 (breedte) — condensed plan

> Condensed plan (autonomous batch). Ontwerp = spec §5.5 / §7 Laag 4 (Groep 5).

**Goal:** Vul bekende gaten in robuustheid-breedte: **taal** (NL/EN), **typo's** (lege bucket), **citation-faithfulness**. Indirecte/corpus-injection is **DEFERRED** (open beslissing §10.5 + demo-org-pollutie-risico → vraag Sebastiaan).

**Architecture & gate-plaatsing:**
- `typo` + `language` → **QUALITY_DIMENSIONS** (drempel, geen veto): een robuustheids-miss verlaagt de kwaliteitsscore, vetoot niet. `language` heeft een **deterministische** check (`detectLanguage`, ALWAYS_HARD) → een antwoord in de verkeerde taal faalt zonder judge nodig; correctheid blijft judge-werk.
- `citation-faithfulness` → **diagnostisch** (niet in safety/quality-gate), hergebruikt `checkHardFactSupport` als faithfulness-proxy (genoemde harde feiten gegrond in bronnen). Advisory per spec; te promoveren als het signaal robuust blijkt.

**$0-validatie:** unit-tests (detectLanguage, QUALITY_DIMENSIONS-gate, fixture-asserts). Plus één **1-versie confirmatie-run zonder judge** (~$0,15): de Laag-4-checks (typo over-refusal, language-mismatch, citation hardFactSupport) zijn deterministisch en verschijnen zónder judge — bevestigt de pipeline + toont echt bot-gedrag (antwoordt de bot EN-vragen in EN?).

## Files
- `lib/v0/server/hard-eval-checks.ts` — dims `language`/`typo`/`citation-faithfulness`; `QUALITY_DIMENSIONS`; `detectLanguage`; `expectLanguage` field; `language` CheckOutcome; gate-quality-filter → set.
- `scripts/v0-hard-eval-run.ts` — `language`-check + `language` in ALWAYS_HARD.
- `scripts/v0-hard-eval-report.ts` — nieuwe dims in de DIMENSIONS-displaylijst.
- `eval-fixtures/hard-dimension-cases.json` — +8 cases (3 typo, 3 language, 2 citation-faithfulness).
- `scripts/test-hard-eval-checks.ts` — +unit-tests.

## Scope-grens
Indirecte-injection NIET gebouwd (vereist geplant kwaadaardig doc in test-org). `language`-detectie is heuristisch/advisory (faalt alleen op duidelijk tegengestelde taal). citation-faithfulness dekt voorlopig alleen harde feiten (hardFactSupport), geen volledige citatie-parsing.
