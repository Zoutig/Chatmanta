# Productie-gate Eval — Laag 2 (vertrouwen) — condensed plan

> Condensed plan (autonomous batch — Lagen 2-4 achter elkaar). Ontwerp = spec §5.4 / §7 Laag 2. TDD-discipline op de pure logica; $0-validatie.

**Goal:** Maak de gate *reproduceerbaar* (Groep 4): regressie-diff vs een groene baseline, rubric-anchoring voor consistent judgen, en multi-run-stabiliteit voor ruis-detectie.

**Architecture:** Pure helpers in `hard-eval-checks.ts` (testbaar, $0). Regressie-diff vergelijkt twee result/verdict-paren op `finalCaseStatus`. Rubric-anchoring = nieuwe fixture `hard-eval-anchors.json` die de runner bovenaan de judge-queue injecteert. Multi-run = bestaande `selfConsistencyRuns` + een `--multi-run=N` runner-flag voor de safety-subset; report surfacet instabiele cases.

**$0-validatie:** unit-tests + de regressie-diff draaien op twee BESTAANDE runs (Laag 0-baseline `20260529-*` vs Laag 1 `20260531-*`). Geen bot-gen.

## Files
- `lib/v0/server/hard-eval-checks.ts` — types `StatusFlip`/`AnchorVerdict`/`AnchorsFile`; `computeRegressionDiff`, `buildAnchorSection`, `unstableCases`.
- `eval-fixtures/hard-eval-anchors.json` *(nieuw)* — 4 gouden anker-verdicts (uit geobserveerd v0.9-gedrag).
- `scripts/v0-hard-eval-run.ts` — laad anchors → injecteer in judge-queue header; `--multi-run=N` flag (safety-subset).
- `scripts/v0-hard-eval-report.ts` — `## Regressie-diff (vs baseline)` blok (`--baseline=<ts>`) + `## Stabiliteit (multi-run)` blok.
- `scripts/test-hard-eval-checks.ts` — unit-tests voor de 3 helpers.

## Taken (TDD)
1. `computeRegressionDiff` — pure status-flip-diff (pass↔fail = regressie/verbetering; pending/absent = geen bevestigde flip). Test + impl + commit.
2. `buildAnchorSection` + `unstableCases` + anchors-fixture. Test + impl + commit.
3. Runner: anchors-injectie + `--multi-run=N`. Typecheck + commit.
4. Report: regressie-diff + stabiliteit-blokken. Typecheck + commit.
5. $0-validatie: unit-tests + diff twee bestaande runs. PR + merge.

## Scope-grens
Geen bot-gen-vereiste; geen nieuwe gate-veto (Groep 4 is meta/diagnostisch). Multi-run-flag is opt-in (default uit) zodat het de standaard-run niet duurder maakt.
