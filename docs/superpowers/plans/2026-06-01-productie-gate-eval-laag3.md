# Productie-gate Eval — Laag 3 (realisme) — condensed plan

> Condensed plan (autonomous batch). Ontwerp = spec §5.1 / §7 Laag 3 (Groep 1).

**Goal:** Voed de gate met realistische input: een **query_log-harvest-harness** (echte bezoekersvragen → answer-quality-case-kandidaten) + een paar **multi-turn**-cases.

**V0-eerlijkheid:** `query_log` is in V0 dun en grotendeels eigen test-verkeer met fake demo-data. De harvest-WAARDE is deels vooruitkijkend (vol rendement in V1 met echte klanten). We bouwen de harness nu, PII-veilig, en seeden wat er is — kandidaten gaan naar een review-bestand, NIET automatisch de fixture in.

**Architecture:** Pure selectie-logica (`normalizeQuestion`, `selectHarvestCandidates`) in `hard-eval-checks.ts` (testbaar, $0). Het script `v0-hard-eval-harvest.ts` doet de DB-I/O (leest `query_log` kind='answer'), redacteert/skipt PII via `redactPii`, en schrijft kandidaten naar `eval-out/hard/harvest-candidates-<ts>.json`. Multi-turn = nieuwe fixture-cases met `conversationHistory` (runner ondersteunt dit al).

**$0-validatie:** unit-tests (dedupe/per-org-cap/PII-skip) + de harvest één keer draaien (alleen DB-read, geen bot-gen) + fixture-well-formed-test. Multi-turn-cases worden mechanisch gedekt door bestaande `conversationHistory`-infra; volledige bot-gen-validatie volgt in de eerstvolgende volledige run.

## Files
- `lib/v0/server/hard-eval-checks.ts` — `normalizeQuestion`, `selectHarvestCandidates`, types `HarvestInput`/`HarvestCandidate`.
- `scripts/v0-hard-eval-harvest.ts` *(nieuw)* — DB-read + PII-skip + schrijf kandidaten.
- `package.json` — script `eval:hard:harvest`.
- `eval-fixtures/hard-dimension-cases.json` — +3 multi-turn answer-quality/consistency-cases.
- `scripts/test-hard-eval-checks.ts` — unit-tests harvest-selectie + multi-turn fixture-asserts.

## Taken
1. `normalizeQuestion` + `selectHarvestCandidates` (pure). Test + impl + commit.
2. Harvest-script + npm-script. Run ($0 DB-read) + commit.
3. +3 multi-turn cases + fixture-test. Test + commit.
4. PR + merge.

## Scope-grens
Harvest schrijft NOOIT automatisch in de fixture (review-bestand). Geen migratie (alleen `query_log`-READ). Multi-turn klein houden (~3) i.v.m. bot-gen-kosten op latere runs.
