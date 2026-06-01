# `/intake` — ontwerpspec

> **Status:** ontwerp goedgekeurd (brainstorm 2026-05-31), nog te bouwen.
> **Deliverable:** een globale Claude Code skill op `~/.claude/skills/intake/SKILL.md` (buiten de chatmanta-repo).
> **Dit document:** de spec die de basis vormt voor het bouwen van die skill via `superpowers:writing-skills`.

## Probleem

Niels (Customer/Launch Lead, niet-code) levert feature-plannen aan als losse Markdown-bestanden — rijke **product-PRD's** met velden, flows, e-mailteksten en randgevallen. Twee echte voorbeelden: `ChatManta_Feedbackformulier.md` en `ChatManta_Quiz_Systeem.md`.

Die pitches zijn goed als productbeschrijving, maar raken **nergens de engineering-realiteit van ChatManta**:

- Geen hard rules (`organization_id NOT NULL`, RLS-in-dezelfde-migratie, service-role-discipline, anti-hallucinatie, V1 Minimal Build Scope).
- Geen kostenbewustzijn (de Quiz laat een AI de héle kennisbank lezen → context-/kosten-explosie).
- Geen besef van wat er **al bestaat of in de pijplijn zit** — het Feedbackformulier overlapt grotendeels met het al-lopende feedbacksysteem (PR #151 + `docs/FEEDBACKSYSTEEM_PLAN.md`).
- Geen mapping naar de codebase-structuur (`lib/v0`, dashboards, datamodel/RLS) of de bestaande UI-stijl.

Vandaag moet Sebastiaan die vertaalslag handmatig maken vóór er gebouwd kan worden. `/intake` automatiseert dat: van Niels' MD naar een **codebase-gegronde, kritisch beoordeelde spec** en — na één go/no-go — door naar een PR.

## Positionering (gekozen aanpak A)

`/intake` is een **dunne front-end die delegeert** naar de bestaande build-skills, niet een zelfstandige end-to-end-pijplijn. Het doet alléén het Niels-specifieke deel (MD-ingestie, multi-angle kritiek, grounding, vragen, sign-off) en geeft de verbeterde spec dóór aan `ship-feature` of `big-ship` — exact het patroon waarmee `big-ship` nu `ship-feature` "by reference" hergebruikt.

**Waarom niet de alternatieven:**
- *Standalone end-to-end skill* → dupliceert `big-ship`/`ship-feature`-logica → copy-drift-risico waar `big-ship` zelf voor waarschuwt. Afgewezen.
- *`big-ship` uitbreiden met een "Niels-MD-modus"* → propt elke pitch (ook een klein formuliertje) door de zware `big-ship`-machine en blaast die skill op. Afgewezen.

De bestaande review-gates (Codex-review-loop, clean prod-build, eval-gate) rijden gratis mee via de build-skill onderaan — `/intake` hoeft die niet over te doen.

## Aanroep & locatie

- **Aanroep:** `/intake <pad-naar-MD>`. Geen pad meegegeven → de skill vraagt erom.
- **Skill-locatie:** `~/.claude/skills/intake/SKILL.md` (globaal, naast `big-ship`, `ship-feature`, `check-migration`).
- **Spec-output van een run:** `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md` (in de chatmanta-repo, standaardlocatie zodat `ship-feature`/`big-ship` 'm oppikken).

## Flow

```
Niels' MD  →  /intake <pad>
   Fase 0  MD inlezen + parsen
   Fase 1  Intake-kritiek (één Workflow, budget-geschaald):
             recon  +  overlap-radar  +  6 lens-agents  →  judge/synth
   Fase 2  Gegronde spec wegschrijven (+ kosten/effort, scorecard)
   Fase 3  Eén vragenronde aan Sebastiaan (+ kopieerbaar Niels-bericht)
   Fase 4  ÉÉN sign-off-gate  ── go/no-go ──┐
   Fase 5  Doorrollen naar build  ──────────┘  ship-feature | big-ship (by reference)
```

### Fase 0 — Inlezen
Lees het opgegeven MD-bestand en parse het tot een gestructureerd beeld (doel, velden/flows, datamodel-hints, randgevallen, aannames van Niels).

### Fase 1 — Intake-kritiek (één Workflow)
Draait als één **Workflow** fan-out (de skill-instructie ís de Workflow-opt-in, net als bij `big-ship`; degradeer naar `dispatching-parallel-agents` als Workflow onbeschikbaar is). Budget-geschaald: recon-breedte schaalt met `budget.total` (guard op `null`).

Parallelle agents:
1. **Codebase-recon** — `Explore`-agents (read-only) op relevante slices: `lib/v0`, dashboards (`app/klantendashboard`, `app/admindashboard`, `klant.css`), datamodel + RLS, relevante bestaande modules. Synthese → terreinbrief die de lens-agents lezen.
2. **Overlap-radar** *(killer feature)* — grep/zoek over `lib/v0`, `app/`, `docs/`, **open + gemergede PRs** (`gh pr list`, `gh pr list --state merged`) en `MEMORY.md`. Detecteert "bestaat al / wordt al gebouwd / staat al gepland". Output bij een hit: een expliciete **STOP-aanbeveling** (zie red flags).
3. **6 lens-agents** — elk leest Niels' MD tegen één lens:
   - **Datamodel & hard rules** — `organization_id NOT NULL`, RLS in dezelfde migratie, service-role-discipline (`lib/supabase/admin.ts`), soft-delete-patroon, migratienummer reserveren via `check-migration`. *Deze lens is een **veto**: schendingen worden must-fix.*
   - **Security & AVG** — PII (feedbackform verzamelt naam + e-mail → AVG-grond), bijlage-uploads (10 MB → Storage-bucket + type/grootte-validatie), embed/origin-token-patronen waar relevant.
   - **LLM-kosten & performance** — context-grootte (Quiz leest hele kennisbank → chunking/samenvatting + €), caching, latency, modelkeuze (de Quiz zegt "Sebastiaan bepaalt het model" → flag).
   - **Scope vs V1 Minimal Build** — hoort dit nú of is het V2/V3? Past het op het V0-platform of vereist het V1-auth (per-user identiteit)? Zo ja → scope-flag + V0-compatibel pad of uitstel voorstellen.
   - **UX-consistentie & feasibility** — matcht het bestaande dashboards (gedeelde `klant.css`, admindashboard, drawer-shell), welke randgevallen/contradicties miste Niels?
   - **Codebase-fit** — past de voorgestelde structuur bij `lib/v0`-conventies, naamgeving, bestaande helpers?
4. **Judge/synthesizer** — voegt alle bevindingen samen tot één *Gap- & Grounding-rapport* + een **pitch-scorecard** (zie extensies).

### Fase 2 — Gegronde spec
Schrijf naar `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md` met een **intake-preambule**:
- **Niels-diff** — wat Niels voorstelde → wat wij bouwen & waarom het afwijkt.
- **Overlap-verdict** — bestaat dit al / in flight? (uit de overlap-radar.)
- **Scope-oordeel** — V0 nu / V1 / V2-uitstel.
- **Kosten- & effort-schatting** — ruwe € LLM-kosten van de feature + aantal milestones/effort *(v1-extensie)*.
- **Open vragen** — alles wat de skill aan Sebastiaan stelt.
- **Pitch-scorecard** — volledigheidsscore van Niels' MD *(v1-extensie)*.

Daarna pakt `ship-feature`/`big-ship` exact deze spec op als de SPEC (slaat eigen spec-afleiding over).

### Fase 3 — Vragen aan Sebastiaan
Eén ronde via `AskUserQuestion` met **álle** open vragen (geen druppelsgewijze onderbrekingen — de gekozen "één sign-off-gate"-discipline). Routing-keuze: **alles aan Sebastiaan; hij speelt zelf door naar Niels.** Daarom genereert de skill óók een **kopieerbaar, niet-technisch Niels-bericht** (keuzes + product-vragen) dat Sebastiaan in één klik doorstuurt *(v1-extensie)*.

### Fase 4 — Eén sign-off-gate
Toon: de gegronde spec + €/effort-schatting + **route-advies** (`ship-feature` vs `big-ship`, automatisch bepaald op grootte). Vraag expliciet go/no-go. Een groot ontwerpbesluit wordt nooit door stilte genomen.

### Fase 5 — Doorrollen naar build
Bij akkoord, automatische routing op grootte:
- **Multi-subsystem / nieuwe bot-versie / volledig dashboard** (zoals de Quiz: AI-analyse + admin-goedkeuring-UI + portal-quiz + DB + antwoord-ingestie) → `big-ship` **by reference**.
- **Normale feature/bugfix (3+ files)** → `ship-feature` **by reference**.
- **Triviaal (1 file)** → direct bouwen, geen build-skill.

De gegronde spec wordt meegegeven als de SPEC zodat de build-skill zijn eigen spec-afleiding overslaat en direct naar plan + bouwen gaat.

## v1-extensies (gekozen)

1. **Kosten- & effort-schatting vooraf** — ruwe € LLM-kosten + milestone-count in de sign-off-gate, zodat go/no-go met cijfers gebeurt.
2. **Pitch-scorecard + levend sjabloon voor Niels** — scoort Niels' MD op volledigheid (datamodel? randgevallen? auth? kosten?) én onderhoudt een `NIELS_PITCH_TEMPLATE.md` dat Niels vertelt welke secties hij moet invullen. Compounding: pitches komen na verloop van tijd engineering-rijper binnen — dicht de gap bij de bron.
3. **Kopieerbaar terugkoppel-bericht voor Niels** — één nette, niet-technische samenvatting (keuzes + product-vragen) die Sebastiaan doorplakt.

## Geparkeerd (niet in v1)

- **Memory-write na intake** (overlap/scope-besluit vastleggen voor latere sessies) — bewust uitgesteld.
- **Batch-intake** van meerdere MD's tegelijk met cross-feature-interactie-detectie — YAGNI nu.
- **Visuele mockup-generator** voor UI-zware pitches — YAGNI nu.

## Ingebouwde stop-reflexen (red flags)

| Signaal | Reactie |
|---|---|
| Overlap-radar vindt bestaand/in-flight werk | **STOP** — adviseer "eerst verzoenen, niet dubbel bouwen", geen auto-build (de Feedbackform ↔ PR #151-situatie). |
| Spec vereist V1-auth terwijl we in V0 zitten | Scope-flag + V0-compatibel pad of uitstel voorstellen. |
| Kosten-explosie (bv. hele kennisbank in context) | Flag + chunking/samenvatting + €-schatting. |
| Feature valt onder V2/V3 (V1 Minimal Build Scope) | Niet nu bouwen; uitstel adviseren. |
| Migratie nodig | Nummer reserveren via `check-migration` vóór bouwen; RLS-policies in dezelfde file. |
| Hard-rule-schending in Niels' ontwerp | Must-fix (de datamodel-lens is veto). |

## Acceptatiecriteria

- `/intake <pad>` leest een MD van Niels, draait de Workflow-kritiek en produceert een gegronde spec in `docs/superpowers/specs/`.
- De spec bevat de intake-preambule (Niels-diff, overlap-verdict, scope-oordeel, kosten/effort, open vragen, scorecard).
- Op de twee bestaande voorbeelden gedraagt de skill zich correct:
  - **Feedbackformulier** → overlap-radar vlagt PR #151 + `FEEDBACKSYSTEEM_PLAN.md` en adviseert verzoenen i.p.v. dubbel bouwen.
  - **Quiz** → flag kosten (hele kennisbank in context), route-advies = `big-ship`, scope-check op V1-auth-afhankelijkheid.
- Eén vragenronde aan Sebastiaan + een kopieerbaar Niels-bericht.
- Eén sign-off-gate vóór bouwen; bij akkoord delegatie naar `ship-feature`/`big-ship` by reference.
- De skill dupliceert geen build-logica (geen copy van `ship-feature`/`big-ship`-gates).

## Out of scope (expliciet NIET)

- Geen eigen build-/PR-/merge-logica — dat is `ship-feature`/`big-ship`.
- Geen automatisch verzenden naar Niels (alleen een kopieerbaar bericht).
- Geen memory-write, batch-intake of mockup-generator (geparkeerd).
- Geen wijziging aan de bestaande skills behalve aanroep-by-reference.

## Implementatie-noot

Het deliverable is een skill, geen code-feature. Bouwen gebeurt daarom via `superpowers:writing-skills` (frontmatter met scherpe description-triggers, token-efficiëntie, red-flags-tabel) i.p.v. `writing-plans`. De `SKILL.md` volgt de stijl van `big-ship`/`ship-feature` (fasen als checkpoints, "by reference"-hergebruik, een red-flags-tabel, project-specifieke noten onderaan).
