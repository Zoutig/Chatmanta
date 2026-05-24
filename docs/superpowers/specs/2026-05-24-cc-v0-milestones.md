# SPEC — V0 milestones (V1-launch readiness) in Command Center

## What

Voeg 19 milestones toe aan het Command Center (`cc_milestones`) onder fase `v0`.
Samen vormen ze de definition-of-done van V0: wanneer deze af zijn, is ChatManta
klaar om V1 live te zetten bij de eerste drie testklanten (ActionSpeedControl,
Cleans Reinigingen, Maxus Studios). De set is verdeeld over drie eigenaren:
Sebastiaan (8 product/tech), Niels (6 customer/launch), Samen (5 launch/go-no-go).

De data wordt geschreven via een eenmalig, idempotent seed-script in de stijl van
`scripts/cc/clean-slate.mjs` en `scripts/cc/backfill-prs.mjs`.

## Acceptance criteria

- [ ] `scripts/cc/seed-v0-milestones.mjs` bestaat, met dezelfde env-loader +
      service-role-client als de andere `scripts/cc/*`-scripts.
- [ ] Script is **dry-run by default**; schrijft alleen met `--confirm`.
- [ ] Script print de target-DB-host vóór het schrijft (verifieerbaar juiste DB).
- [ ] Script is **idempotent**: milestones waarvan de titel al in `cc_milestones`
      staat worden overgeslagen (geen duplicaten bij herhaald draaien).
- [ ] Alle 19 milestones komen binnen met: `roadmap_phase='v0'`, juiste `owner`
      (Sebastiaan/Niels/Samen), `status='Niet gestart'`, `description`,
      `acceptance_criteria[]`, lege `linked_task_ids`.
- [ ] `package.json` heeft een `cc:seed-v0-milestones` script (consistent met
      `cc:clean-slate` / `cc:backfill-prs`).
- [ ] Na de write zijn de 19 milestones zichtbaar in `/commandcenter/roadmap`
      en `/commandcenter/milestones` onder fase v0.

## Out of scope

- GEEN subtaken aanmaken of koppelen (`linked_task_ids` blijft leeg). De velden
  bieden ruimte voor latere koppeling; nu niet invullen.
- GEEN extra/verzonnen milestones. Een eventueel ontbrekende milestone gaat als
  apart "Voorstel"-voorstel naar de gebruiker, niet automatisch in de DB.
- GEEN verwijdering/aanpassing van bestaande milestones (incl. de oude `v1`
  seed-milestones die hier inhoudelijk mee overlappen) — alleen toevoegen.
  Opschonen is een aparte, expliciet bevestigde stap.
- GEEN UI-wijzigingen aan Command Center.
- GEEN migration (tabel `cc_milestones` bestaat al sinds 0026).

## Edge cases

- **Herhaald draaien** → idempotent via titel-match; niets dubbel.
- **Titel al aanwezig (bv. door eerdere seed)** → overslaan, gerapporteerd als skip.
- **Ontbrekende env-vars** → script faalt met duidelijke melding, schrijft niets.
- **Titel > 200 tekens** → niet van toepassing (alle titels kort), maar de
  DB-CHECK zou het anders afvangen.
- **Verkeerde owner-/status-waarde** → afgevangen door de CHECK-constraints in
  migration 0026; mapping in het script gebruikt exact de toegestane waarden.
