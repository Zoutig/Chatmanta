# Launch-ready-onderzoek — rapport (nacht 6→7 okt 2026)

> Status: IN OPBOUW (wordt tijdens de nacht gevuld). Spec: `docs/superpowers/specs/2026-10-07-launch-ready-onderzoek-design.md` · log: `docs/NACHT_LOG_2026-10-07.md`.

## 1. Samenvatting (één scherm)

_volgt_

## 2. Meetlat

Gewogen foutscore per antwoord (kritiek = veto, ernstig ×3, licht ×1, toon ×0,25), geblindeerde Claude-jury per vraag tegen de volledige bronnen. Sets: screening (64 vragen ×2: dev-set 40 + probe + 12 vragen van een gecrawlde "onbekende klant"), holdout (143 nieuwe vragen, nooit gebruikt voor tuning; 28 op de onbekende klant), hard-eval (63 cases), V1-eval (15), Sol-ronde (186 standaardvragen).

## 3. Kandidaten en screening

_volgt_

## 4. Combinaties

_volgt_

## 5. Eindvalidatie

_volgt_

## 6. Aanbeveling

_volgt_

## 7. Productie-bevindingen buiten de antwoordlaag

_volgt_

## 8. Data-wijzigingen en terugdraaien

| wijziging | backup | terugdraaien |
|---|---|---|
| Catering-demosite (knowledge_source `49a5715b…`, 32 pagina's) in dev-org gedeactiveerd | `eval-out/backups/20261007-0110-catering-deactivatie.json` | `UPDATE knowledge_sources SET disabled_at=NULL WHERE id='49a5715b-1951-4d87-a5ef-51760d186084'; UPDATE website_pages SET included=true WHERE knowledge_source_id='49a5715b-1951-4d87-a5ef-51760d186084';` |
| Nieuwe eval-org `…a5` "Autorijschool Veenstra (holdout)" + `…a6` (clean-KB-kopie): organizations, documents, parent_chunks, document_chunks | n.v.t. (nieuw) | delete per organization_id `…a5`/`…a6` (documents CASCADE) + eval_questions van die orgs |
| 155 + 40 nieuwe eval_questions (tag `holdout` / `clean-kb`) | n.v.t. | delete where tags @> '{holdout}' or '{clean-kb}' |
| must-not-labels `v061-hardfact-prijs-per-maand` (−"€249") en `v063-hardfact-grounding-rate` (−"85%") | git (`eval-fixtures/label-corrections.json`) | git revert + `npm run eval:relabel` |
| Answer-cache van alle V0-orgs gewist | — | regenereert vanzelf |
