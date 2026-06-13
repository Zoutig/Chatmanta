# Nacht-audit — opdracht (ROL & DOEL)

> Volledige prompt voor de autonome nacht-audit op de ChatManta V0-codebase.
> Bewaard als bestand omdat de `/goal`-tekst de 4000-tekenlimiet overschreed.

## ROL & DOEL

Je draait deze nacht autonoom en onbewaakt op de ChatManta V0-codebase. Doel, in
prioriteitsvolgorde:

1. **VEILIGHEID**
2. **correctheid / bug-vrij**
3. **versimpeling & opschoning** (minder code, minder abstractie, dode code weg)
4. **performance** ("soepel en snel")

## JE WERKOMGEVING IS AL KLAARGEZET — NIET OPNIEUW OPZETTEN

- Je draait in worktree `C:\Users\solys\Documents\Code\chatmanta-nachtaudit` op branch
  `feat/seb/nacht-audit` (gebaseerd op `origin/main` #187). Maak GEEN nieuwe worktree.
- `.env.local`, `.claude/agents` (chatmanta-reviewer + eval-runner), `settings.local.json`,
  `graphify-out` en `node_modules` staan er al. Doe één pre-flight smoke (bv. `npm run v0:list`)
  om te bevestigen dat de OpenAI-key werkt vóór je iets zwaars draait.
- Lees eerst `graphify-out/GRAPH_REPORT.md`, `AGENTS.md`, `CLAUDE.md` en de memory-index. De hard
  rules daarin zijn bindend.

## KERNHOUDING — tegen over-engineering

Jij neigt naar te complexe oplossingen. Vannacht is de opdracht het OMGEKEERDE: maak code
eenvoudiger, niet uitgebreider. Voeg geen abstractielagen, helpers of "flexibiliteit voor later"
toe. Bij twijfel of iets over-gecompliceerd is: FLAG het in het rapport, rij het niet uit.
Dode code en duplicatie verwijderen = hoog vertrouwen, dat mag. Werkende code herstructureren
= laag vertrouwen, alleen als de winst evident is én de test/build het bewijst.

## HARDE GRENZEN (niet onderhandelbaar)

- Blijf op branch `feat/seb/nacht-audit`. NOOIT op main. NOOIT pushen naar main. NOOIT mergen,
  NOOIT deployen.   **[TOGGLE 1: dit is PR-niet-mergen]**
- Geen billable externe calls. Geen `eval:run` / OpenAI-evals. Alleen GRATIS checks: `tsc`, lint,
  `next build`, `npm run eval:hard:run` (Claude-judge = gratis), en Codex.   **[TOGGLE 2]**
- Per wijziging één afgebakende zorg = één branch (vertak van `feat/seb/nacht-audit`) = één PR.
  Kleine diffs. Commit klein en vaak.
- Gebruik NIET de skills `big-ship` of `ship-feature` (die stallen op sign-off-gates). Voer direct uit.

## NIET AANRAKEN — alleen rapporteren met aanbeveling

- Supabase migrations, RLS-policies, datamodel-wijzigingen.
- Security-gevoelige paden: embed-token (HMAC), service-role wrappers (`lib/supabase/admin.ts`),
  rate-limiting, vector-search isolatie.
- Widget publieke API-contract (`/embed`, `/api/v0/chat`, `/api/v0/widget/*`, `/widget.js`).
- V1-code en alles dat blueprint als V2/V3 markeert.

Vind je hier een echt probleem: bovenaan het rapport als bevinding + voorgestelde fix, code NIET wijzigen.

## V0-SANDBOX — false-positive guard

V0 is BEWUST niet multi-tenant-veilig: de `v0_active_org` cookie en `?org=<slug>` worden zonder
autorisatie geaccepteerd, en er is één gedeeld `V0_DEMO_PASSWORD`. Dit is GEEN bug en mag je NIET
"fixen" of als kwetsbaarheid rapporteren. Bij twijfel over hard rules: dispatch de project-agent
`chatmanta-reviewer` als veiligheids/conventie-lens.

## WERKWIJZE (fases, met subagents + Codex-loop)

**Fase A — Recon:** lees `GRAPH_REPORT.md`, bouw een lijst audit-targets (RAG-kern `lib/v0/server`,
crawler `lib/v0/crawler`, widget/embed, dashboards, server actions, API-routes, `lib/errors`,
rate-limiting).

**Fase B — Fan-out:** dispatch per target een read-only subagent (Agent tool) die GESTRUCTUREERD
rapporteert: `{severity, area, file:line, type — bug|security|complexity|dead-code|perf,
beschrijving, voorgestelde fix, confidence}`. Draai meerdere subagents parallel. Gebruik
`chatmanta-reviewer` voor de security/hard-rules-lens.

**Fase C — Codex-cross-check (loop):** leg hoogste-severity bevindingen én elke voorgestelde
fix-diff voor aan Codex via de `codex:rescue`-skill. Instructie aan Codex = "probeer te weerleggen
/ vind het gat". BELANGRIJK: gebruik model `"gpt-5.5"` (of `"gpt-5.4"`) — default `gpt-5.x-codex` faalt
met 400 op dit account. Verwerp bevindingen die Codex overtuigend weerlegt. Cap retries.

**Fase D — Fix** (alleen VEILIG + in-scope + hoog vertrouwen): implementeer op een sub-branch,
verifieer (zie hieronder), open een PR met de volledige `.github/pull_request_template.md`.
Niet mergen.

**Fase E — Rapport:** schrijf en HOUD CONTINU BIJ `docs/NACHT_AUDIT.md`, zodat er ook bij een stall
om 4u een bruikbaar partieel rapport staat.

## VERIFICATIE (per wijziging — geen claim zonder bewijs)

- `npx tsc --noEmit` moet schoon zijn.
- Windows: `Remove-Item -Recurse -Force .next` vóór elke verificatie-build (vervuilde `.next` crasht
  `next build`). Daarna `next build`.
- RAG-rakende wijziging: `npm run eval:hard:run` (gratis) — geen regressie.
- Edit nooit `bots.ts` terwijl een eval/run loopt (tsx exit 9).

## ANTI-STALL

Blokkeer je op een beslissing die echt aan Sebastiaan is? Schrijf 'm als OPEN VRAAG in het
rapport en ga door met het volgende item. Niet wachten. Werk de lijst af op prioriteit
(risico × vertrouwen): veiligheid en correctheid eerst, dan hoog-zekere versimpelingen, dan perf
(alleen meten/voorstellen, geen premature optimalisatie — RAG-latency heeft al een TTFT-framework).

## OUTPUT (klaar voor de ochtend)

1. `docs/NACHT_AUDIT.md`: geprioriteerde tabel — severity | area | file:line | bevinding |
   voorgestelde fix | status (PR #… / deferred-needs-decision / verworpen-na-Codex).
2. Lijst van geopende PR's.
3. Sectie OPEN VRAGEN voor Sebastiaan.
4. Sectie NIET-AANGERAAKT-MAAR-RISICO: security/migration/V1-bevindingen met aanbeveling.

Begin nu met Fase A en werk door tot de target-lijst leeg is of er geen veilige, hoog-zekere
verbeteringen meer zijn.
