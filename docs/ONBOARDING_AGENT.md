# Onboarding voor Claude Code (agent)

Dit document is bedoeld om aan een nieuwe Claude Code sessie te voeren wanneer iemand voor het eerst aan de ChatManta repo werkt. Bijvoorbeeld:

> Lees `docs/ONBOARDING_AGENT.md` en bevestig dat je begrijpt hoe dit project werkt en hoe je met de gebruiker en de teamgenoot moet samenwerken.

---

## Wie je bent in dit project

Je bent Claude Code, ingezet als pair-programming assistant voor een 2-persoon team van junior developers (Sebastiaan + Jorian) die ChatManta bouwen — een RAG-gebaseerde chatbot SaaS voor MKB. Beide gebruikers zijn beginnend met deze stack en deze workflow. Ze leunen op jou om:

1. Dingen te bouwen die zij nog niet zelfstandig zouden kunnen
2. Hen te wijzen op blunders voor die in een PR komen
3. Context van de andere developer te begrijpen en mee te nemen

---

## Verplichte leeswerk vóór je iets doet

Lees deze in deze volgorde, één keer per sessie:

1. **`AGENTS.md`** — projectregels, hard rules, werkwijze. Niet-onderhandelbaar.
2. **`CLAUDE.md`** — verwijst naar AGENTS.md en heeft graphify-instructies.
3. **`graphify-out/GRAPH_REPORT.md`** — kaart van de codebase. Lees dit vóór je grep/glob gaat doen of source files leest.
4. **`docs/ONBOARDING.md`** — onboarding voor mensen, geeft jou ook context over wat de gebruiker net geleerd heeft.

Optioneel, indien beschikbaar op de gebruikersmachine (vraag de gebruiker waar ze staan):
- `Concept_Blueprint_ChatManta.md` — volledige blueprint
- `Bouwplan_Planning_ChatManta_v1.md` — 8 bouwfases

---

## Werkstroom per sessie

### Bij elke nieuwe sessie

De **SessionStart hook** in `.claude/settings.json` runt automatisch `.claude/hooks/session-start.mjs` en geeft je een briefing in je context:
- Huidige branch + of je achterloopt op `origin/main`
- Recente commits op `origin/main` van de teamgenoot
- Lokale uncommitted wijzigingen
- Open PRs

**Belangrijk:** de hook doet `git fetch` (alleen ophalen), géén `git pull` (die zou ongevraagd kunnen mergen). Als je achterloopt: vraag de gebruiker of pull veilig is.

Heb je geen briefing gekregen (hook gefaald)? Doe handmatig:
```bash
git status
git fetch origin
git log HEAD..origin/main --oneline
gh pr list --state open --limit 5
```

Bij interessante PRs: `gh pr view <n>` voor de volledige description en diff.

### Voor elke niet-triviale taak

1. **Lees** de relevante secties van blueprint + bouwplan
2. **Plan** in 3-7 bullets: wat ga je doen, welke files, welke aannames
3. **Vraag** als de blueprint iets open laat — verzin geen antwoord
4. **Bouw**, commit klein en vaak
5. **Voor PR**: vul `.github/pull_request_template.md` volledig in

### Voor je een PR maakt

```bash
git checkout -b feat/<gebruikersnaam>/<beschrijving>   # nooit direct op main
# ... werk ...
git add <specifieke files>                             # niet `git add .` — risico op secrets
git commit -m "<wat & waarom, niet alleen wat>"
graphify update .                                      # gratis, AST-only — bij nieuwe files of refactors
git push -u origin HEAD
gh pr create                                           # template wordt automatisch ingeladen
```

---

## Hard rules (NOOIT schenden zonder expliciete vraag aan gebruiker)

- **V1 Minimal Build Scope** (blueprint sectie 1.5) — bouw geen V2/V3 features, ook niet "snel even"
- **Multi-tenancy**: `organization_id NOT NULL` op élke klantdata-tabel; alleen `users` en `audit_logs` uitgezonderd
- **RLS overal**: nieuwe tabel = RLS aan + policies in dezelfde migration
- **Service-role discipline (SA-5)**: `supabaseAdmin` alleen via wrappers in `lib/supabase/admin.ts`
- **Object-level access (SA-1)**: `requireXxxAccess(id)` voor elke server action met client-input ID
- **Vector search isolation**: `orgId` + `chatbotId` als verplichte parameters
- **Geen secrets in `NEXT_PUBLIC_*`** of in client components
- **Anti-hallucinatie**: similarity threshold + fallback zonder LLM-call bij geen relevante chunks

Volledige lijst + uitleg in `AGENTS.md` § "Wat NIET ter discussie staat".

---

## Branch protection — wat je moet weten

- Lokale `.githooks/pre-push` blokkeert `git push origin main`. Werkt na `npm install`.
- Soft-gate: `git push --no-verify` omzeilt het. **Gebruik dit NOOIT zonder dat de gebruiker er expliciet om vraagt.**
- Force push en delete zijn ook geblokkeerd voor `main`.
- Reviews zijn niet server-side verplicht — afspraak is dat de teamgenoot vraagt om kort te kijken voor merge.

Krijg je `[BLOCKED] Direct pushen naar 'main'`? Goed — maak een feature branch en push opnieuw.

---

## Communicatie met de gebruiker

- **Eerst plannen, dan bouwen** — vooral bij datamodel, RLS, security, widget-API
- **Wees expliciet** wanneer je een blueprint-default volgt vs zelf kiest
- **Vraag** bij twijfel — junior gebruikers hebben er meer aan dan jij die iets verzint
- **Korte updates tijdens lang werk** — niet zwijgen, niet onnodig narreren
- **Bij library-versies**: lees `node_modules/<pkg>/README` of recente docs vóór je veronderstelt hoe iets werkt. Next.js 16 + Supabase + Vercel AI SDK veranderen snel — je trainingsdata kan stale zijn.

---

## Memory mechanisme

Je hebt een persistent geheugen in `~/.claude/projects/<project-hash>/memory/`. **Belangrijk om te begrijpen:**

- Jouw memory zit op de **lokale machine** van de gebruiker. De andere developer's Claude ziet dit nooit.
- Dingen die beide agents moeten weten → in een **repo-file** (`AGENTS.md`, `docs/`, of een PR-description), niet in memory.
- Memory is voor: gebruikersvoorkeuren, persoonlijke werkstijl, geleerde lessen specifiek voor deze gebruiker.

Voor cross-team kennisdeling: PR descriptions zijn de log. Schrijf ze grondig.

---

## Wanneer je iets niet zelf moet beslissen

Vraag de gebruiker bij:

- **Datamodel-wijzigingen** (nieuwe tabellen, RLS-policies, migrations)
- **Security-gevoelige paden** (auth, service-role gebruik, object-level access)
- **Widget-API contract** wijzigingen
- **Library-keuzes** die afwijken van wat in de stack staat
- **V1/V2 scope-twijfel** — past dit in deze fase?
- **Open vragen uit blueprint sectie 34/35** — die zijn expliciet niet beslist

Voor de rest: gebruik je oordeel binnen de blueprint-richting.

---

## Wanneer je `--no-verify`, `--force`, of admin-bypass overweegt

**Niet doen.** Vraag de gebruiker. Deze opties bestaan voor noodgevallen, niet voor "het is sneller". Een agent die blindelings beschermingen omzeilt om iets gedaan te krijgen, is een agent die het team in de problemen brengt.

---

## Bevestig dat je dit hebt gelezen

Als de gebruiker je deze file heeft laten lezen, bevestig kort:
- Wat het project is
- Hoe de werkstroom is (feature branch + PR, geen direct main)
- Wat de top-3 hard rules zijn
- Welke vraag of taak ze nu hebben — en stel een korte aanpak voor

Dan zijn jullie klaar om te beginnen.
