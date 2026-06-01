# Streamline v0.9.3 — task/commit-breakdown

Spec: `docs/PROMPT_STREAMLINE_PLAN.md` (criteria C1–C18). Aanpak: RESTRUCTURE-PRESERVE, in-place op v0.9.3, alles in één versie.

## Task 0: Baseline-eval vastleggen (vóór elke edit)
- `npm run v0:clear-cache` → eval op de HUIDIGE v0.9.3; cijfers (must-not, unsupported-hard-fact, zero-correctness, per-bucket grounding) wegschrijven naar `docs/eval-baseline-v093.md`.
- Reden: in-place overschrijven wist de live baseline; we leggen 'm eerst vast als gate-referentie.

## Task 1: Herschrijf `V0_9_3.systemPrompt` in `lib/v0/server/bots.ts` (in-place)
- Files: `lib/v0/server/bots.ts`
- Nieuwe structuur: persona → harde veiligheidskern (grounding + trust-boundary + scope always-on + weiger-carve-out, primacy) → antwoord-houding (positief) → opmaak+structuur (samengevoegd, geen eigen zinsaantal) → emit-contract (alleen `<thinking>/<answer>/<confidence>`, `[N]` weg, confidence→1 regel).
- Verwijderd uit de systemPrompt-string: `CITATIES`-`[N]`-blok, geo-bridging-blok (verhuist naar user-turn, Task 2), TAAL-blok + trailing "default Nederlands", "meestal 2-5 zinnen", STRUCTUUR-zinsaantal, 4-bands confidence-tabel, CoT-uitleg-alinea.
- Alle GEDRAG-flags ongewijzigd (spread van bestaande config). `outputStyleVersion` blijft `v3` (geen style.ts-mutatie nodig).
- Tests: append-only-invariant-test (`scripts/test-bot-defaults.ts`); grep dat lengte-getallen/`[N]`/bridging weg zijn.

## Task 2: Conditionele geo-bridging + user-turn-anker in `lib/v0/server/rag.ts`
- Files: `lib/v0/server/rag.ts` (rond 2202–2241, de `sourceLinksIntro`/`matchedSpanIntro`-seam).
- Geo-blok (gecomprimeerd ~90 woorden) alleen injecteren als de chunk-context een regio/werkgebied/openingstijd-signaal bevat (ruime regex-gate). Achter `bot.<flag>`? Nee — gebonden aan v0.9.3-gedrag; gate puur op context, geen nieuwe BotConfig-flag (C17: geen flag-wijziging). 1-regel taal+grounding+trust-anker direct vóór `VRAAG:` (recency).
- `mirrorUserLanguage`-injectie ongewijzigd laten; het anker dupliceert die niet (anker = algemene taal-spiegel + grounding-herinnering).
- Tests: unit/spot-check dat geo alleen bij trigger verschijnt; anker altijd aanwezig; injection-seam byte-identiek voor niet-geo queries.

## Task 3: Eval-gate (na de edits)
- `npm run v0:clear-cache` → eval op de twee nieuwste versies → vergelijk met Task 0-baseline.
- Gate: must-not ≤ baseline (0 nieuwe slug), unsupported-hard-fact ≤ baseline, zero-correctness ≤ baseline, per-bucket grounding-delta ≥ −0,10.
- Bucket-checks: off-domein 100% geweigerd · geo-bucket (Lelystad→ja & Randstad→geen-blanket-ja) · medium-lengte stijgt niet · taal NL→NL/EN→EN.
- Faalt de gate → terug naar Task 1/2, niet mergen.
