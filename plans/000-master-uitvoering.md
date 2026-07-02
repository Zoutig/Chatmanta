# Plan 000: Master-uitvoeringsplan — audit-fixbatch (plannen 001–009)

**Status:** goedgekeurd door Sebastiaan op 2026-07-02 (AskUserQuestion): plan 006 volledig
inclusief migraties via Supabase MCP; uitvoering in zichtbare worktree `../chatmanta-audit-fixes`;
na groene eindverificatie PR + **direct squash-mergen** (expliciet geautoriseerd).

**Branch:** `feat/seb/audit-fixes-batch` (vanaf `628e7df`). **Werkmap:** `C:\Users\solys\Documents\Code\chatmanta-audit-fixes`.

## Doel

Alle negen audit-plannen (`plans/001` t/m `plans/009`) in één batch uitvoeren met een team
van executor-agents, elk gereviewd door de orkestrator (Fable), afgesloten met één PR.
De individuele planbestanden blijven de bron van waarheid voor *wat* er gebeurt; dit
masterplan regelt *hoe* — volgorde, toewijzing, overrides en verificatie.

## Uitvoeringsvolgorde en toewijzing

Strikt sequentieel in één gedeelde worktree — vier plannen raken `package.json`/lockfile
(001, 004, 002, 008), dus parallelle worktrees zouden onnodige merge-conflicten geven.

| # | Plan | Executor | Waarom dit model |
|---|------|----------|------------------|
| 1 | 001 test-runner + verify | **Opus** | Wekken van 8 slapende tests vergt triage-oordeel |
| 2 | 004 check-env + docs + Node-pin | **Sonnet** | Mechanisch, exact gespecificeerd |
| 3 | 002 axios/form-data advisories | **Sonnet** | `npm audit fix` + checks |
| 4 | 003 follow-up-chips 1-regel-fix | **Sonnet** | Eén argument, exact excerpt |
| 5 | 005 timing-safe CRON-helper | **Opus** | 5 routes + nieuwe security-helper + test |
| 6 | 009 migrate.mjs checksum + TLS | **Opus** | Raakt de prod-DDL-tool; fail-loud-logica |
| 7 | 008 ponytail-opruiming | **Sonnet** | Deletions/verhuizingen met greps |
| 8 | 007 V1 PII-gate tests | **Opus** | Gedragsbevriezende extractie op live PII-route |
| 9 | 006 cache-epoch-guard + migraties | **Fable (orkestrator zelf)** | RAG-hotpath + datamodel — belangrijkste taak |

## Overrides op de individuele plannen

1. **Git-workflow**: géén per-plan branches. Alles op `feat/seb/audit-fixes-batch`. Executors
   committen wél zelf, met de commit-message uit hun plan. Nooit pushen.
2. **plans/README.md-statusrijen**: bijgehouden door de orkestrator, niet door executors.
3. **Plan 006 Step 0 (akkoord Sebastiaan)**: ✅ afgetekend 2026-07-02. Migratienummers
   geverifieerd: V0 → `0054_v0_cache_epoch.sql`, V1 → `0017_v1_cache_epoch.sql` (hoogste
   bestaand: 0053/0016; open PRs #232/#207 claimen geen migraties).
4. **Migratie-toepassing 006**: `npm run migrate` haalt de pooler vanaf deze machine vaak
   niet → toepassing via Supabase MCP (`apply_migration`/`execute_sql`) op beide projecten,
   inclusief `insert into public._migrations(id) …`-ledger-rij, VÓÓR de code gemerged wordt
   (fail-closed code zonder tabel zou cache-writes pauzeren).
5. **Plan 001-lintnoot blijft van kracht**: lint (36 pre-existing errors) komt níet in
   `verify` of CI in deze batch.

## Reviewprotocol (per plan, door de orkestrator)

Na elke executor, vóór de volgende start:
1. Done-criteria van het plan zelf her-runnen (niet vertrouwen op het rapport).
2. Scope-check: `git diff --stat HEAD~1` tegen de in-scope-lijst; buiten-scope = REVISE/BLOCK.
3. Volledige diff lezen; conventies + intentie toetsen.
4. Nieuwe tests inhoudelijk lezen (asserten ze iets echts?).
Verdicten: APPROVE → volgende plan; REVISE → zelfde agent, max 2 rondes (SendMessage);
BLOCK → status BLOCKED in README, batch gaat dóór tenzij het 001 betreft (dependency
van 005/007/008 — dan die drie herbeoordelen).

## Executor-contract (gaat verbatim in elke agent-prompt)

- Werk uitsluitend in `C:\Users\solys\Documents\Code\chatmanta-audit-fixes` (relatieve paden
  of dit prefix; NOOIT paden onder `C:\...\Code\chatmanta\` = de hoofdrepo).
- Lees je volledige planbestand vóór je begint; volg het stap voor stap; draai elke
  verificatie; STOP-condities zijn hard. Documenteer elke afwijking in NOTES.
- Commit op de huidige branch met de message uit je plan; sla de README-statusupdate over.
- Rapporteer in het vaste format: STATUS / STEPS / STOPPED BECAUSE / FILES CHANGED / NOTES —
  en claim niets zonder tool-bewijs uit je eigen sessie.

## Eindverificatie (orkestrator, na plan 9)

| Check | Commando | Eis |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Unit-tests | `npm run test:unit` | exit 0, ≥29 testfiles + nieuwe tests uit 005/006/007 |
| Build | `.next/` verwijderen → `npm run build` | exit 0 |
| Lint niet slechter | `npm run lint` | ≤ 36 errors (baseline 2026-07-02) |
| Audit | `npm audit --omit=dev` | 0 high |
| Adversariële review | `/code-review` op de branch-diff | bevindingen getrieerd + gefixt |

## Afronding

1. `plans/README.md` statussen → DONE (of BLOCKED met reden), plus dit masterplan.
2. PR met volledig ingevulde `.github/pull_request_template.md`; CI (`build.yml`) groen.
3. Squash-merge met `--delete-branch` (geautoriseerd), daarna: lokale branch `-D`,
   `git worktree remove ../chatmanta-audit-fixes`, en in de hoofdrepo de untracked
   `plans/`-kopie verwijderen vóór `git pull` (anders blokkeert de pull op
   untracked-overschrijving).
4. Eindrapport aan Sebastiaan: per plan verdict, verificatie-uitkomsten, restpunten.

## Risico's & vangnetten

- **Slapende tests (001) verbergen mogelijk een echte bug** → executor STOPt; orkestrator
  beslist (fix in batch als S, anders BLOCKED + apart traject).
- **Pooler-block (009 Step 5)** → `node --check` + gerapporteerde beperking is acceptabel;
  drift-detectie wordt dan op CI/een bereikbare machine bewezen.
- **006 raakt de RAG-hotpath** → extra: unit-test op de skip/write-besluitfunctie +
  epoch-bump-bewijs via MCP-select na purge-aanroep; lookup-pad blijft onaangeraakt.
- **Squash-merge sluit stacked niets af** (geen stacked PRs hier) maar `--delete-branch`
  + `-D` lokaal is verplicht (repo squasht altijd).
