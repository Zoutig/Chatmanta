# SPEC — WP3: answer_cache-invalidatie bij instellingen + repro item 10

> Gegrond in `docs/superpowers/specs/2026-06-12-niels-punchlist-triage.md` (item 10 + WP3),
> goedgekeurd door Sebastiaan op 2026-06-12 (intake-gate) en 2026-06-13 (WP3 = nu bouwen).

## Wat

Niels meldde "niks onder de instellingen-kop werkt" (taal op Spaans → antwoord blijft NL,
toon verandert niks). De wiring is aantoonbaar gezond; de co-root-cause is de answer_cache:
gekeyed op (org, bot-versie, vraag-embedding) zónder stijl/taal in de key, en geen enkele
settings- of Q&A-mutatie invalideert hem. Wie een instelling wijzigt en dezelfde vraag opnieuw
stelt, krijgt het oude antwoord. Dit pakket maakt instellingen-wijzigingen direct zichtbaar
door de org-cache te purgen bij elke mutatie die antwoorden beïnvloedt, reproduceert daarna
item 10 met schone cache, en maakt de taal-UI eerlijk.

## Acceptatiecriteria

- [ ] Herbruikbare `purgeAnswerCache(organizationId)`-wrapper (org-scoped, verplichte
      niet-optionele parameter, bestaande service-role-route — geen nieuwe ad-hoc client).
- [ ] `saveChatbotSettingsAction` purget de org-cache na een geslaagde save.
- [ ] Q&A-mutaties (`upsertQAItemAction`, `deleteQAItemAction`, `setQAActiveAction`) purgen
      óók — zelfde wrapper; dit is de must-fix-helft van item 11 die WP4 anders opnieuw raakt.
- [ ] Purge-falen breekt de save niet (fout loggen, save slaagt) — cache is regenereerbaar.
- [ ] Repro item 10 ná purge, met bewijs: (a) toon-wijziging zichtbaar in nieuw antwoord op
      eerder gestelde vraag; (b) primaryLanguage=es + autodetect UIT → Spaans antwoord;
      (c) autodetect AAN + NL-vraag → NL antwoord (by-design spiegelen, geen bug);
      (d) answerLength kort vs uitgebreid → meetbaar lengteverschil.
- [ ] Taal-sectie in de instellingen-UI legt het autodetect-gedrag eerlijk uit (detector kent
      alleen NL/EN; vaste taalkeuze geldt alleen met autodetect uit).
- [ ] Stale "Save is mock-only"-comment in `app/klantendashboard/instellingen/page.tsx` weg.

## Buiten scope (expliciet NIET)

- Taal-detector uitbreiden naar 5 talen — apart scope-besluit ná de repro (Sebastiaan).
- Q&A-ingest / supersede (WP4) — alleen de cache-purge-haak landt hier.
- Stijl/taal in de cache-key opnemen of selectief purgen — purge-alles-per-org volstaat
  (lage hit-rate, volledig regenereerbaar).
- saveWidgetSettings purgen — widget-instellingen (kleur, naam, welkom, starters) raken de
  gegenereerde antwoorden niet.
- Admin-/eval-paden: eval gebruikt `disableCache` en merkt hier niets van.

## Edge cases

- Purge faalt (DB-fout): save slaagt, fout wordt gelogd — geen 500 voor de klant.
- Lege cache: purge is no-op, geen fout.
- Parallelle chat-request tijdens purge: kan nog één stale hit schrijven/lezen — acceptabel
  (zelfde venster bestaat nu permanent); geen locking bouwen.
- Org zonder v0_org_settings-rij: save-pad maakt die aan zoals nu; purge draait gewoon.
