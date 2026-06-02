# v0.10 — Build Report (lopend)

> Autonome nacht-build op `feat/seb/v0-10-autonoom`. Terminal state = draft PR (geen merge/deploy).
> Bron: `docs/V0_10_BUILD_CRITERIA_AUTONOOM.md` (leidend) + `docs/V0_10_BUILD_PROMPT.md` (wrapper).

## Status-overzicht

| Item | Wat | Status |
|------|-----|--------|
| Eerste actie | worktree + smoke + hard-verify | ✅ groen |
| P1 | basis op v0.9.3 | ✅ |
| P2 | judge-fix #168 verify + re-baseline | ⏳ caps ✅ / baseline-run TODO |
| P3 | v0.10-snapshot | ✅ (byte-identiek; tsc+test+build groen) |
| P4 | over-refusal-meting betrouwbaar | �doing |
| C1 | CI build.yml | ⬜ |
| C2 | DEPLOY.md + startup-assert | ⬜ |
| C3 | per-org dag-budget-cap USD | ⬜ |
| C4 | widget graceful degradatie | ⬜ |
| C5 | injection-block embed verify (test) | ⬜ |
| C6 | Upstash live-ready (assert + handoff) | ⬜ |
| C7 | PII-redactie in logQuery | ⬜ |
| C8 | retentie-cron | ⬜ |
| C9 | widget disclosure + delete-pad | ⬜ |
| C10 | orgId niet-optioneel productie-surface | ⬜ |
| C11 | over-refusal tunen (fabricatie-klasse-lever) | ⬜ |
| C12 | hard-fact-gate stabiel op v0.10 | ⬜ |
| C13 | UX-discipline verify | ⬜ |
| §6 | eind-gate + LATEST flip + draft PR | ⬜ |

## Pre-flight (Eerste actie) — ✅
- Worktree `../chatmanta-v0-10` op `feat/seb/v0-10-autonoom`, HEAD `8c9ff62` (incl. #168 `ce25dbc`).
- `.env.local` + `node_modules` aanwezig; `OPENAI_API_KEY` + `EMBED_TOKEN_SECRET` actief.
- Smoke `v0:chat --threshold=0.4 "wat doet ChatManta?"` → echt antwoord, $0.000307.
- HARD-VERIFY: `LATEST_BOT_VERSION = V0_9_3`; hoogste migratie `0045` → volgende veilig = **0046**.
- P2 caps geverifieerd: `JUDGE_SOURCE_PER = 8000`, `JUDGE_SOURCE_TOTAL = 24000` op base.

## Belangrijke vondsten (sturen de bouw)
- **C11-lever = fabricatie-klasse-only, NIET "drop medium".** `aoc-*` out-of-corpus fabricaties
  halen retrievalStrength=`medium`; medium droppen zou ze doorlaten (fabricatie herintroductie).
  De veilige lever: gate alléén op een ontbrekend **money/percentage/date**-feit (de fabricatie-
  klasse), niet op generieke getallen/jaartallen die in een gegrond antwoord landen.
- **Over-refusal-meetfout (P4):** `refused` = regex `looksLikeRefusal` op `results[0]`. Vals-
  positief op gegronde antwoorden met "neem contact op"-CTA. Over-refusal wordt gemeten over
  álle `expectsRefusal===false` cases (~30, incl. 20 answer-quality) — daar zitten de CTA-fp's.
  Fix: tel op het echte refusal-event (fallback/smalltalk/deterministische hard-fact-replacement)
  + majority-of-N. Signaal: nieuwe `extras.deterministicHardFactRefusal` op de replacement.
- **CANDIDATE = laatste versie in `--versions`** → `--versions=v0.9.3` alléén laat v0.9.3 multi-run draaien (P4-stabiliteitscheck).

## Onderweg gevonden (afwijkingen van de spec-aannames)
- **`/privacy` bestaat AL** (PR #160, `○ /privacy` in de build) — C9's "bestaat nog NIET" is stale.
  C9 wordt: widget-disclosure (link naar bestaande /privacy) + delete-by-visitor-endpoint;
  /privacy alleen aanvullen als de widget-disclosure er een anker/sectie voor nodig heeft.
- **`scripts/test-bot-defaults.ts` was RED op de base** (#167 herschreef de v0.9.3-prompt in-place
  maar liet de oude append-only-assertions staan; geen CI ving het). In P3 bijgewerkt naar de echte
  #167-code (veiligheidskern-asserts i.p.v. `startsWith`). Bevestigt het nut van C1 (CI-build).

## Eval-spend (lopend, cap $15 / noodrem $20)
- Smoke v0:chat: ~$0.0006 (2 calls).
- (eval-runs hieronder bijhouden)

## Open beslissingen voor de ochtend
- (bijwerken aan het eind)
