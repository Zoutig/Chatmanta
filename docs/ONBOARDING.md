# Welkom bij ChatManta

Dit document is voor mensen (Sebastiaan + Niels). Voor Claude Code agents is er een aparte `ONBOARDING_AGENT.md`.

## Wat is ChatManta?

Een SaaS-product van Jorion Solutions. Klanten (kleine bedrijven) krijgen een chatbot op hun website die vragen kan beantwoorden op basis van hun eigen content (website + documenten). Onder de motorkap: RAG (Retrieval-Augmented Generation) met Claude Haiku als taalmodel.

We zitten in de pre-build / V1-fase. Eerst MVP, daarna 2-3 testklanten, daarna pas uitbreiden.

## Stack in één oogopslag

- **Next.js 16** (App Router) + TypeScript + Tailwind v4 + shadcn/ui
- **Supabase** voor database (Postgres met pgvector), auth en file storage
- **Anthropic Claude Haiku 4.5** voor antwoorden, **OpenAI text-embedding-3-small** voor embeddings
- **Firecrawl** om websites te crawlen
- **Vercel** voor hosting

## Eerste keer setup

### 1. Wat je nodig hebt
- Node.js 20+ ([download](https://nodejs.org/))
- Git (komt mee met Git for Windows)
- GitHub CLI: `gh` ([install](https://cli.github.com/))
- Een GitHub-account met toegang tot `Zoutig/Chatmanta`
- Toegang tot het Supabase-project + de OpenAI/Anthropic API keys (vraag aan Sebastiaan)

### 2. Clone + installeer
```bash
gh repo clone Zoutig/Chatmanta
cd Chatmanta
npm install
```

`npm install` zet automatisch de git pre-push hook aan (zie [Werkwijze](#werkwijze) hieronder).

### 3. Environment-bestand
```bash
cp .env.local.example .env.local
```
Open `.env.local` en vul de waarden in (Sebastiaan deelt de keys via een password manager — **nooit via Slack of e-mail**).

### 4. Smoke test
```bash
npm run check-env       # checkt of alle env vars er zijn
npm run dev             # start de dev server op http://localhost:3000
```

Werkt het? Top, je bent klaar.

---

## Werkwijze

### De gouden regel: nooit direct op `main`

Alles gaat via een **feature branch** + **Pull Request (PR)**. Dit voorkomt dat we elkaars werk overschrijven.

Als je per ongeluk op `main` probeert te pushen, krijg je dit:
```
[BLOCKED] Direct pushen naar 'main' is geblokkeerd.
```
Dat is goed — de hook beschermt je. Maak een feature branch en push opnieuw.

### Het normale rondje

```bash
# 1. Begin elke werksessie met up-to-date code
git checkout main
git pull

# 2. Maak een feature branch
git checkout -b feat/<jouwnaam>/<korte-beschrijving>
# bijvoorbeeld: feat/niels/widget-theme

# 3. Werk, commit klein en vaak
git add <files>
git commit -m "korte beschrijving van wat dit doet"

# 4. Push je branch
git push -u origin HEAD

# 5. Open een PR
gh pr create
# Vult automatisch het PR-template in — vul de vragen in en submit
```

### Voor je merget

- Vraag de ander om kort te kijken (review is niet verplicht maar wel slim)
- Lokaal getest? Dev server draait, geen TypeScript errors?
- Geen [hard rules](#de-3-regels-die-niet-onderhandelbaar-zijn) geschonden?

Daarna kun je via GitHub op "Merge pull request" klikken, of `gh pr merge --squash --delete-branch` runnen.

### Tips om elkaar niet in de weg te zitten

- **Spreek vooraf werk af.** Korte standup aan begin van de dag: "ik werk vandaag aan X, jij?". Voorkomt dat jullie tegelijk in dezelfde files duiken.
- **Korte branches.** Een branch die langer dan 2-3 dagen leeft = mergeconflict-risico.
- **Pull voor je begint.** Anders bouw je op stale code en krijg je conflicts bij push.
- **Praat als je vastzit.** Niet uren modderen — vraag.

---

## De 3 regels die niet onderhandelbaar zijn

Deze keuzes zijn al gemaakt. Hier afwijken = risico op datalek of AVG-overtreding.

### 1. Multi-tenancy by design
Elke tabel die klantdata bevat heeft een `organization_id NOT NULL` kolom. Uitzonderingen: alleen `users` en `audit_logs`. Dit zorgt dat data van klant A nooit per ongeluk bij klant B terechtkomt.

### 2. RLS overal (Row-Level Security)
Bij elke nieuwe tabel hoort RLS aan + policies in dezelfde migration. **Niet later toevoegen.** Anders staat de tabel even open voor iedereen.

### 3. Geen secrets in client code
Alles wat in `NEXT_PUBLIC_*` staat is publiek leesbaar in de browser. API keys, service-role keys, etc. → alleen server-side.

Volledige lijst van hard rules staat in `AGENTS.md` § "Wat NIET ter discussie staat".

---

## Waar staat wat?

| File / Folder | Waarvoor |
|---|---|
| `AGENTS.md` | Instructies voor Claude Code agents — ook nuttig voor jou om te lezen |
| `CLAUDE.md` | Verwijst naar AGENTS.md + graphify-instructies |
| `app/` | Next.js pages + routes |
| `lib/` | Helpers, Supabase clients, auth |
| `scripts/` | CLI scripts (zie `package.json` voor wat ze doen) |
| `supabase/migrations/` | Database schema-wijzigingen — sequentieel, nooit handmatig editen na merge |
| `docs/` | Dit soort documenten + verdere uitleg |
| `graphify-out/GRAPH_REPORT.md` | Auto-gegenereerd kennis-overzicht van de codebase |
| `eval-fixtures/` + `eval-out/` | RAG-evaluatie testset + resultaten |

Bron-van-waarheid documenten (buiten de repo, op Sebastiaan's machine):
- `Concept_Blueprint_ChatManta.md` (~3400 regels, het volledige plan)
- `Bouwplan_Planning_ChatManta_v1.md` (~1500 regels, de 8 bouwfases)

Vraag Sebastiaan om deze te delen als je ze nog niet hebt.

---

## Hulp krijgen

1. **Vraag het Claude Code in de terminal.** Open Claude Code in de project-folder; hij leest `AGENTS.md` en weet hoe dit project werkt.
2. **Vraag Sebastiaan.** Voor security-gevoelige dingen, blueprint-vragen, of "mag dit?".
3. **Lees `AGENTS.md`** — daar staat veel context die ook voor mensen nuttig is.

---

## Veelgemaakte fouten (om te voorkomen)

- **Direct op `main` werken** → blokkeert bij push, maar verspilt tijd. Altijd eerst feature branch.
- **Je `.env.local` committen** → staat in `.gitignore`, maar dubbel checken. Secrets in een password manager, niet in git.
- **Tabel toevoegen zonder RLS** → vraag Sebastiaan om je migration te reviewen vóór merge.
- **Vergeten te pullen vóór je begint** → mergeconflicten bij push. `git pull` voor elke nieuwe branch.
- **`git push --no-verify` gebruiken** → omzeilt de hook. Alleen voor noodgevallen waarbij je het uitlegt.
