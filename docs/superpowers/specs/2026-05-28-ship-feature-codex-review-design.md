# Ship-feature v2 — automatische Codex review-en-fix-lus + verificatiegates

**Datum:** 2026-05-28
**Status:** Ontwerp goedgekeurd (brainstorm), wacht op implementatieplan
**Auteur:** Sebastiaan + Claude
**Scope-doel:** Brede tune-up van de globale `ship-feature` skill, met een automatische Codex review-en-fix-lus als kern.

---

## 1. Context & probleem

De `ship-feature` skill (`~/.claude/skills/ship-feature/SKILL.md`) drijft de end-to-end flow
`worktree → spec → plan → implement → PR → merge → cleanup → safe-to-close`. Twee zwakke plekken
kwamen naar voren uit het `/insights`-rapport (2026-05-28) en de bekende chatmanta-valkuilen:

1. **Codex-review is nu een botte deny-gate.** Een *globale* PreToolUse-hook
   (`~/.claude/hooks/pre-push-codex-review.mjs`) draait Codex op elke `git push` en weigert de push
   bij een `BLOCK:`-regel (of bij elk antwoord zonder net `ALLOW:`/`BLOCK:`-prefix). Dit is de bron
   van de gerapporteerde false-positive BLOCKs ("Claude vecht met z'n eigen classifier"). De
   ship-feature merge-stap leunt impliciet op deze hook en roept zelf niets aan.
2. **First-pass bugs worden pas bij review gevangen** (regex-matches, state-sharing, ontbrekende
   query-params) — en daarna handmatig gefixt, in extra rondes.

Daarnaast bestaan er chatmanta-specifieke verificatie-valkuilen die ship-feature nu niet als harde
gate afdwingt: de Windows dirty-`.next` build-crash, Next.js metadata-route filename-collisies, en
RAG-kwaliteitsregressies in de bot-engine.

## 2. Doelen

- Vervang de botte deny-gate door een **automatische review-en-fix-lus** waarin Codex de schifter
  informeert en **Claude de fixes toepast waar het het mee eens is** — niks blokkeert automatisch.
- Maak verificatie vóór de PR expliciet en afdwingbaar via benoemde gates (build, browser, eval).
- Verzacht de merge-frictie: bij een classifier-block een schone handmatige fallback i.p.v.
  herhaald falen.
- Houd het kostenbewust (lus-cap, conditionele gates).

## 3. Niet-doelen (out of scope)

- **GEEN** harde, automatische blokkade meer op findings. Claude schift en beslist; niks weigert
  werk autonoom.
- **GEEN** verandering aan de chatmanta `.githooks/pre-push` (main-protection + migration-collision
  blijven zoals ze zijn).
- **GEEN** nieuwe bot-versie of RAG-wijziging. Dit raakt alleen de workflow-skill + globale config.
- **GEEN** herschrijving van de andere ship-feature stappen (worktree-bootstrap, SPEC, PLAN, cleanup,
  safe-to-close blijven inhoudelijk ongewijzigd).

## 4. Engine-beslissing: MCP-tool, niet de CLI

**Beslist: `mcp__codex__codex` (sandbox `read-only`) + `mcp__codex__codex-reply` voor herreview-rondes.**

Onderbouwing (geverifieerd in de plugin-bestanden, codex 1.0.4):

| Criterium | MCP-tool | CLI-companion (`codex-companion.mjs`) |
|---|---|---|
| Automatisch in-flow aanroepbaar | Ja, directe tool-call | `/codex:review` = `disable-model-invocation: true` (slash-only) |
| Gestructureerde findings | Ja, Claude stuurt de prompt | Verbatim `finalMessage`-tekst |
| Wie fixt | Codex meldt (read-only) → **Claude schift + edit** | review-pad **verbiedt** auto-fix (`codex-result-handling` CRITICAL); `task`-pad = Codex fixt zelf (forwarder-contract) |
| Herreview-lus | `codex-reply` houdt thread + geheugen vast | elke `review`-call vers → hele diff opnieuw |

De CLI-review is architectonisch gebouwd om auto-fixen te verbieden — het tegenovergestelde van het
gewenste model. De MCP-tool past native: read-only review → Claude schift → Claude fixt → `codex-reply`
herreviewt op dezelfde thread.

**Randvoorwaarde:** de Codex MCP-server moet draaien (interactief = ja). In headless/cron-runs kan de
MCP-server ontbreken; dan vervalt de gate stilzwijgend — veilig, want niets blokkeert hard.

## 5. Nieuwe vorm van de flow

Tussen *implement* (stap 4) en *PR* komt één samengesteld **Pre-PR gates**-blok (stap 5). Bestaande
stappen schuiven één nummer op.

```
1 worktree → 2 SPEC → 3 PLAN → 4 implement
   ↓
5 PRE-PR GATES (nieuw — elke gate groen vóór de PR opengaat)
   5a  Codex review-en-fix-lus   (altijd)
   5b  Schone prod-build         (altijd)
   5c  Browser-verify Playwright (conditioneel: UI-changes)
   5d  Eval-gate                 (conditioneel: bot-engine changes)
   ↓
6 PR → 7 Merge (+ soepele fallback) → 8 cleanup → 9 safe-to-close
```

Rationale voor vóór de PR (niet erna): de PR wordt **schoon geboren** — fixes zitten in de eerste
commits, geen rommelige review-fix-commits achteraf, en de push-tijd-hook is niet meer nodig.

## 6. Gate-specificaties

### 5a — Codex review-en-fix-lus (altijd)

Per ronde:

1. **Review** — roep `mcp__codex__codex` aan met `sandbox: read-only`, `cwd` = repo-root, en een
   prompt die de branch-diff (`git diff origin/main...HEAD`) meegeeft en vraagt om findings als
   **gestructureerde lijst**: `{bestand, regel, ernst, probleem, voorgestelde fix}`. Bewaar de
   `threadId` uit het resultaat.
2. **Schift** — voor élke finding: lees de echte code op die plek, classificeer als *echte bug* vs
   *false-positive* (baseline ≈2 FP/review), en *auto-fixbaar* vs *heeft-Sebastiaan-nodig*.
3. **Fix toepassen** — pas de akkoord-bevonden, auto-fixbare findings toe als één
   `fix(review): <korte omschrijving>` commit voor die ronde.
4. **Herverifieer** — draai typecheck + unit tests; een fix mag niets breken.
5. **Herreview** — `mcp__codex__codex-reply` met de bewaarde `threadId` en de nieuwe diff.
6. **Stopconditie** — stop zodra Codex geen bruikbare findings meer meldt **óf** na **2 rondes**
   (kostenrem).
7. **Rapporteer** — een tabel `finding → toegepast / verworpen (met reden)` naar de gebruiker.
   "Heeft-Sebastiaan-nodig"-findings worden gemeld, niet stilzwijgend toegepast.

Niets weigert ooit automatisch werk; Claude is de schifter.

### 5b — Schone prod-build (altijd)

Draait ná de Codex-lus (dus op de gefixte code):

1. `Remove-Item -Recurse -Force .next` (de Windows dirty-`.next` native-worker-crash voorkomen).
2. `next build`.
3. Check op Next.js metadata-route filename-collisies (`icon.tsx`, `favicon`, `opengraph-image`,
   etc. als gewone componenten onder `app/`) — die breken de prod-build terwijl dev het verbergt.

Faalt de build → stop, fix, herhaal. Geen PR op een rode build.

### 5c — Browser-verify Playwright (conditioneel)

- **Trigger:** de change raakt gerenderde UI (`app/`, `components/`).
- **Actie:** verifieer de acceptatiecriteria uit de SPEC end-to-end in de browser, in light + dark en
  een mobiel viewport.
- **Geen UI-oppervlak:** expliciet "overgeslagen — geen UI-change" rapporteren, niet stil overslaan.

### 5d — Eval-gate (conditioneel)

- **Trigger:** er wijzigen bestanden onder de bot-engine paden (`lib/v0/`).
- **Actie:** draai de goedkope hard-dimensie-eval (deterministisch-eerst) vóór merge.
- **Pure UI/crawler-PR:** overgeslagen — kostenbewust.

## 7. Merge (stap 7) + soepele fallback

Blijft squash-merge (`gh pr merge <num> --squash --delete-branch`). Nieuw gedrag bij een auto-mode
classifier-block: **stop met herhaald proberen**, en geef de gebruiker direct het exacte handmatige
commando + één regel waarom het geblokkeerd werd. De bestaande "verifieer Codex-findings zelf"-noot
verhuist naar 5a (waar de review nu woont).

## 8. Pre-push hook met pensioen (globaal)

Verwijder het `pre-push-codex-review.mjs`-hookblok uit `~/.claude/settings.json` (de PreToolUse-entry
met `if: "Bash(git push *)"`). 

- **Globaal effect:** deze hook geldt voor álle projecten, niet alleen chatmanta. Verwijderen betekent
  dat geen enkel project meer een push-tijd Codex-gate heeft. Bewust — de in-skill lus vervangt 'm en
  hij was puur frictie.
- Het script-bestand `~/.claude/hooks/pre-push-codex-review.mjs` blijft staan (kost niks, makkelijk
  terug te zetten). Alleen het hook-blok in `settings.json` gaat eruit.

## 9. Artefacten die de implementatie raakt

| Artefact | Wijziging | In repo? |
|---|---|---|
| `~/.claude/skills/ship-feature/SKILL.md` | Nieuw stap-5-blok, herschreven merge-stap, fallback, red-flags-rij | Nee — globaal |
| `~/.claude/settings.json` | Pre-push hook-blok verwijderen | Nee — globaal |
| `docs/superpowers/specs/2026-05-28-ship-feature-codex-review-design.md` | Dit ontwerp | Ja — chatmanta |

Omdat skill + settings *globale* config zijn (niet de repo), valt dat werk onder "config-editing" —
geen worktree/PR-ritueel nodig. Alleen de spec-doc landt in chatmanta.

## 10. Acceptatiecriteria

- [ ] `ship-feature/SKILL.md` heeft een benoemd stap-5 "Pre-PR gates"-blok met 5a–5d, in de
      beschreven volgorde, en de overige stappen zijn correct hernummerd (6–9).
- [ ] 5a beschrijft de MCP-lus exact: read-only review → schift → `fix(review):`-commit → typecheck/tests
      → `codex-reply` herreview → stop bij schoon óf 2 rondes → rapport-tabel. Expliciet: niets blokkeert
      automatisch.
- [ ] 5b dwingt `rm .next` + `next build` + metadata-collisie-check af.
- [ ] 5c en 5d zijn expliciet conditioneel met de juiste triggers (UI-paden / `lib/v0/`) en
      "overgeslagen"-rapportage bij niet-triggeren.
- [ ] De merge-stap bevat de classifier-block fallback (stop + exact handmatig commando + reden).
- [ ] Het `pre-push-codex-review`-hookblok is uit `~/.claude/settings.json`; het script-bestand blijft.
- [ ] De skill noemt expliciet de headless/cron-randvoorwaarde (MCP afwezig → gate vervalt veilig).

## 11. Edge cases

- **Codex MCP niet beschikbaar** (headless/cron, server down): 5a meldt "review overgeslagen — Codex MCP
  niet bereikbaar" en gaat door. Niets blokkeert.
- **Codex blijft elke ronde nieuwe findings melden:** harde cap op 2 rondes; resterende findings worden
  gerapporteerd als "open, niet gefixt".
- **Fix breekt typecheck/tests:** de ronde-herverificatie vangt dit; Claude draait de fix terug en meldt
  'm als "verworpen — brak de build".
- **Geen UI en geen bot-engine change:** 5c en 5d beide overgeslagen (gerapporteerd); 5a + 5b draaien
  altijd.
- **Lege diff / niets te reviewen:** 5a meldt "niets te reviewen" en slaat de lus over.

## 12. Risico's

- **Globale hook verwijderen raakt andere repos** — geaccepteerd; gebruiker werkt vrijwel uitsluitend in
  chatmanta en de hook was frictie.
- **MCP-loop kost tokens** — gedempt door de 2-ronde-cap en read-only (geen Codex-write-kosten).
- **Claude schift een echte bug weg als false-positive** — gedempt doordat elke finding tegen de echte
  code wordt gelezen vóór verwerping, en het rapport elke verworpen finding mét reden toont (gebruiker
  houdt overzicht).
