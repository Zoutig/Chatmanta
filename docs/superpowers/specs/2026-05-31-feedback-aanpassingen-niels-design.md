# Ontwerpspec — Feedbacksysteem-aanpassingen (Niels) — 2026-05-31

**Intake-bron:** Niels' wijzigingsverzoek (6 punten) op het bestaande feedbacksysteem,
via `/intake`. Dit is een **aanpassing** van een al-geshipt systeem (geen nieuwbouw).

**Route-advies:** `ship-feature` (normale feature, ~7-9 files + 1 migratie; geen
multi-subsysteem, geen nieuwe bot-versie). Niet `big-ship`.

---

## Intake-preamble

### Overlap-verdict
Geen dubbel-bouw. Alle 6 punten raken het **bestaande** feedbacksysteem:
- Fase 1 (klant-meldingen + operator-inbox) — PR #151, migratie `0043_admin_feedback`
- Fase 2 (operator-beheer) + Fase 3 (e-mail via Resend) — PR #154
- Ontwerp/plan: `docs/feedback/SPEC.md`, `docs/feedback/PLAN.md`, `docs/feedback/FEEDBACKSYSTEEM_PLAN.md`

Dit is een gerichte revisie van die bestaande code. **Geen STOP.**

### Scope-verdict
Volledig **V0**. Geen V1-auth nodig. Geen nieuwe bot-versie. Eén nieuw *publiek*
oppervlak: de privacyverklaring-pagina (`/privacy`) moet **buiten** de V0-wachtwoordgate
vallen — zie punt 3.

### Kosten & effort
- **LLM-kosten: €0** — geen enkel AI-pad wordt geraakt (geen RAG, geen embeddings).
- **Effort:** ~7-9 files + 1 migratie (0045, voor "anders"). 6 kleine deeltaken, één PR.

### Hard-rules-check
- **Migratie (punt 4 "anders"):** `admin_feedback.type` heeft een DB-`CHECK`-constraint →
  uitbreiden vereist een migratie. `admin_feedback` heeft bewust **geen RLS**
  (admin_*-precedent, gedocumenteerd in 0043) → geen RLS-policy nodig, consistent. ✓
- **Multi-tenancy:** `organization_id NOT NULL`, server-side uit de cookie gezet. Ongemoeid. ✓
- **AVG (punt 1):** naam+e-mail verplicht maken = altijd PII verzamelen. Laag risico
  (de indiener is de **ingelogde** zakelijke klant, geen anonieme bezoeker), maar
  hangt samen met een werkende privacyverklaring (punt 3). Flag, geen blocker.

### ⚠️ Repo-state vóór de build
We lopen **4 commits achter op `origin/main`**. Daar staat al `0044_admin_quiz`
(PR #156, gemerged) — lokaal nog niet zichtbaar (lokaal eindigt op 0043). Dus:
1. **Eerst `git pull`** (of de worktree vanaf verse `origin/main` aanmaken).
2. Migratienummer voor "anders" = **0045** (verifiëren met de `check-migration`-skill,
   die ook open PRs checkt).

---

## De 6 wijzigingen — gegrond per punt

### 1. Naam + e-mail verplicht
**Nu:** `app/klantendashboard/feedback/components/feedback-form.tsx` L187/L190 — labels
"(optioneel)", inputs zonder `required`, niet in `canSubmit` (L47-48). Validatie
`lib/controlroom/feedback-validate.ts` behandelt beide als `optional(...)`; e-mail wordt
alleen gecheckt als hij is ingevuld.

**Wijziging:**
- Form: labels "Naam" / "E-mailadres" (zonder "optioneel"), `required` + meenemen in
  `canSubmit` (naam+e-mail als gecontroleerde state of via formRef-check), client-side
  e-mailformaat-check.
- Validatie: in `parseFeedbackForm` naam **en** e-mail verplicht maken
  (`fail('INPUT_INVALID', …)` bij leeg); e-mail-regex blijft.
- Tests: `lib/controlroom/__tests__/feedback-validate.test.ts` — de `valid`-fixture krijgt
  naam+e-mail; nieuwe testcases voor "weigert lege naam" en "weigert lege e-mail".
- **Geen migratie** — kolommen bestaan al (blijven nullable in DB; app dwingt af).

### 2. Emoji's / kleurenbollen weg
**Nu:** `feedback-form.tsx` L20-24 `URGENCY_OPTIONS` met `emoji: '🟢'/'🟡'/'🔴'`,
gerenderd L160 `{o.emoji} {o.label}`. Ook een `📎` op L228 (bijlage-naam).

**Wijziging:** `emoji`-veld + `{o.emoji}` render verwijderen (de expliciet genoemde
kleurenbollen). Beslissing: óók de `📎` weghalen voor consistentie ("ik wil de emoji's
weg"); de lucide `✓`/`Paperclip` *icons* blijven (dat zijn vector-icons, geen emoji).
De admin-lijst gebruikt tone-gekleurde `Pill`-dots — die laat ik staan (Niels' klacht
gaat over het formulier; dashboard-pills zijn onderdeel van het ontwerp).
**Geen migratie.** Pure UI.

### 3. Privacyverklaring-pagina (link gaat nergens heen)
**Nu:** `feedback-form.tsx` L243 — `<a href="https://chatmanta.nl/privacy">`. Er bestaat
**geen** `/privacy`-route in de app → 404. (`lib/controlroom/server/privacy.ts` is iets
ánders: admin-retentie-instellingen per org, geen publieke verklaring.)

**Wijziging:**
- Nieuwe publieke route `app/privacy/page.tsx` met de privacyverklaring.
- Form-link → relatief `/privacy` (zelfde app) i.p.v. de absolute externe URL.
- **De pagina moet buiten de V0-wachtwoordgate vallen** (zoals /embed, /widget.js):
  toevoegen aan de publieke allowlist in de V0-proxy/middleware. → *build-time verify:*
  exact mechanisme + bestand bevestigen vóór implementatie.
- ✅ **Beslist (Q1):** ik **scaffold een complete NL privacyverklaring** op basis van wat
  het systeem feitelijk doet (verzamelde gegevens: naam/e-mail/beschrijving/bijlage +
  chatlogs; bewaartermijnen uit `PRIVACY_DEFAULTS`: chat 30d, issues 90d, metadata 12mnd;
  verwerker = Jorion Solutions; rechten + contact). Sebastiaan/Niels **review't + keurt de
  wording goed vóór live** (juridische verantwoordelijkheid blijft bij hen). **Geen migratie.**
- **Proxy/gate-detail:** de V0-gate is `proxy.ts` in de **repo-root** (Next 16 hernoemt
  `middleware.ts` → `proxy.ts`). Rond regel 26 staat de publieke-paden-allowlist die al
  `/embed/*` + de publieke API-paden + `/crawl-eval/*` vrijstelt — `/privacy` daar toevoegen.

### 4. "Anders" toevoegen aan type melding
**Nu:** `FEEDBACK_TYPES` (`lib/controlroom/types.ts` L231-237): 5 waarden. DB-`CHECK`
(`0043` L37-39) spiegelt die 5. `TYPE_TONE` in de admin-lijst (L28-34) is een exhaustive
`Record` → typecheck breekt als de union groeit zonder dat deze map meegroeit.

**Wijziging:**
- **Migratie 0045** — `admin_feedback.type` CHECK widenen met `'anders'`
  (drop + re-add constraint). Volgt admin_*-conventies (geen RLS).
- TS: `'anders'` toevoegen aan `FEEDBACK_TYPES` + `FEEDBACK_TYPE_LABELS`
  (bv. `anders: 'Anders'`) + `TYPE_TONE` in `app/admindashboard/feedback/page.tsx`.
- ✅ **Beslist (Q2):** géén extra veld. De reden gaat in de al-verplichte beschrijving
  (min. 10 tekens). Geen extra kolom/migratie-werk daarvoor.

### 5. Afgehandelde feedback uit de lijst, maar terugvindbaar
**Nu:** Status-enum heeft al `opgelost` + `gesloten` (`types.ts` L260-273). De
admin-lijst (`app/admindashboard/feedback/page.tsx`) toont **alles** als er geen
status-filter is gekozen (`listFeedback({})` → alle statussen, incl. gesloten).
`getFeedbackSummary` telt al alleen `nieuw`+`in_behandeling` voor de open-count.

**Wijziging:**
- ✅ **Beslist (Q3):** **zowel `opgelost` als `gesloten`** verdwijnen uit de
  standaardlijst. De actieve lijst toont dus alleen `nieuw` + `in_behandeling` (sluit
  precies aan op `getFeedbackSummary`, dat al `nieuw`+`in_behandeling` als "open" telt).
- `listFeedback`/de pagina krijgt een "verberg afgehandelde tenzij gevraagd"-modus:
  - geen status-param → **alleen actieve** meldingen (nieuw + in_behandeling);
  - een expliciete status-keuze (incl. `opgelost`/`gesloten`) of een "Afgehandeld/Archief"-
    keuze in het filterpaneel → toont de afgehandelde meldingen.
- `FeedbackFilter` krijgt een manier om op een set statussen te filteren / afgehandelde uit
  te sluiten (huidige filter is alleen gelijkheid op één status).
- Sluit aan op punt 6 (de "toon afgehandelde/archief"-keuze zit in het filterpaneel).

### 6. Compactere filter in het admindashboard
**Nu:** `app/admindashboard/feedback/page.tsx` L153-187 — **vier volle rijen** chip-knoppen
(Status / Type / Urgentie / Org). Met groeiende orgs + 5 typen wordt dat een groot blok.

**Wijziging:** ✅ **Beslist (Q4): inklapbaar "Filters"-paneel.**
- Standaard **dicht** → de lijst krijgt alle ruimte; een `[ ⚙ Filters ▸ ]`-knop klapt het
  paneel open. Toon naast de knop een korte samenvatting van actieve filters + de open-count
  (bv. `5 open · 2 nieuw`).
- In het paneel: compacte controls voor Status/Type/Urgentie/Org **plus** de
  "toon afgehandelde / archief"-keuze (dekt punt 5).
- De pagina is RSC met URL-`searchParams` (geen client-state). Het open/dicht-klappen +
  navigeren op filterwijziging vraagt een klein client-component (`'use client'`) dat
  `router.push` met de nieuwe query doet (of een `<details>`/GET-`<form>` zonder JS). Houd
  de filter-state in de URL zodat een gedeelde link het filter behoudt.

---

## Beslist (AskUserQuestion 2026-05-31)

- **Q1 — Privacyverklaring-tekst:** ik scaffold een complete NL-verklaring; Sebastiaan/Niels
  review't + keurt goed vóór live.
- **Q2 — "Anders":** géén extra veld; reden in de verplichte beschrijving.
- **Q3 — Verbergen uit lijst:** **zowel Opgelost als Gesloten** verdwijnen uit de standaardlijst.
- **Q4 — Filterstijl:** **inklapbaar "Filters"-paneel** (standaard dicht).

## Pitch-scorecard (volledigheid Niels' verzoek)
- Datamodel-impact benoemd? ✗ (Niels noemt geen migratie — wij signaleren 0045 voor "anders").
- Edge cases? ✗ (geen; wij vullen ze aan: anonieme feedback wegvalt, archief-leegstaat).
- AVG? ✗ (privacyverklaring-inhoud + verplichte PII niet doordacht — wij flaggen).
- Kosten? n.v.t. (€0).
→ Terugkerende gap: **juridische/AVG-inhoud** ontbreekt steeds. Kandidaat voor
  `NIELS_PITCH_TEMPLATE.md` ("welke privacy-/AVG-gevolgen heeft dit verzoek?").

## Build-time verify (door ship-feature te bevestigen vóór implementatie)
- `git pull` (4 commits achter); migratienummer = 0045 via `check-migration`.
- Exacte V0-proxy/middleware-allowlist voor de publieke `/privacy`-route.
- `submitFeedbackAction` (`app/klantendashboard/actions.ts`): `privacy_accepted_at`-zetlogica
  blijft kloppen nu naam/e-mail altijd meekomen.
