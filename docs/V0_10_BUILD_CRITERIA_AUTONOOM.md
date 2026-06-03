# v0.10 — Autonome Bouwopdracht & Acceptatiecriteria

> **Voor de autonome code-agent.** Dit bestand is je volledige opdracht. Je bouwt de hele nacht door tot er een botversie **v0.10** staat die aan de criteria hieronder voldoet en daarmee productie-/V1-ready is. Werk zelfstandig, commit klein en vaak, en stop pas als de Definition of Done (§6) is gehaald óf je aantoonbaar geblokkeerd bent op een human-handoff-item (§2) — log dat dan en ga door met het volgende.
>
> Achtergrond/rationale (niet nodig om te bouwen, wel om te begrijpen): `docs/V0_10_V1_READY_CRITERIA.md` (§Zelfkritiek bovenaan = de getrimde kern) en `docs/V1_PRODUCTIEWAARDIGE_CHATBOT_CRITERIA.md`. Bij twijfel over een keuze: volg dit bestand, het is leidend.

---

## 0. Missie

Lever **botversie v0.10**, gebouwd bovenop **v0.9.3** (de huidige `LATEST_BOT_VERSION` op `origin/main`), die:
1. op elke **vertrouwbare (deterministische) as ≥ v0.9.3** is en de bekende v0.9.3-zwakte **over-refusal (13%) terugbrengt** richting v0.8.1-niveau (~3%) **zonder fabricatie te herintroduceren**, en
2. de **code-side productie-hardening** bevat (kosten-/misbruik-cap, AVG-codelaag, isolatie-fix, observability-haken) die V0 nodig heeft vóór er echte klanten op mogen, en
3. **provisioning-ready** is: alle code staat klaar, en de paar stappen die een mens moet doen (accounts, Vercel env-vars) staan exact beschreven in een `HANDOFF.md`.

"Productie-/V1-ready" = **Agent-DoD (§6) groen** + **Launch-DoD-handoff (§2) gedocumenteerd**. De agent kan de Launch-DoD niet zelf afronden (geen account-/prod-toegang) — dat is bewust.

---

## 1. Harde guardrails (NIET overtreden — ook niet 's nachts)

- **Branch & isolatie.** Werk in een eigen worktree/branch (`feat/seb/v0-10-autonoom`), gebaseerd op **`origin/main`** (= v0.9.3). De huidige lokale werkbranch loopt achter; begin met `git fetch origin && git checkout -b feat/seb/v0-10-autonoom origin/main`. `origin/main` bevat nu de #168-judge-fix (commit `ce25dbc`) — fetch eerst, anders mis je 'm en is je gate stale.
- **Uitvoeringsmodel: GEEN orchestratie-skill met sign-off-gates.** Dit is een onbewaakte nacht-run. Gebruik **niet** `big-ship` (heeft tournament-/spec-/ultra-sign-off-gates die VÓÓR de bouw stallen) en **niet** `ship-feature` (spec/plan-sign-off kan onbewaakt pauzeren). Deze MD ÍS al je spec+plan — voer 'm zelf **stage-voor-stage** uit als één sequentiële implementer. Zet subagents alleen in als **advies** op beslispunten (RAG-tuning C11, AVG-laag C7–C9) en sluit af met een **review-loop** (`/code-review` ⇄ Codex). Nooit een gate inbouwen die op een mens wacht.
- **Pre-flight fail-fast (vóór je íets bouwt).** `.env.local` is gitignored en reist niet mee naar een worktree. Na worktree-setup: kopieer `.env.local` erin, draai `npm ci`, en draai **één smoke-`npm run v0:chat`**. Komt er **geen echt antwoord** terug (ontbrekende `OPENAI_API_KEY`, lege `node_modules`, etc.) → **STOP en log het**; ga NIET de nacht in, want dan draait elke eval key-loos en is alles verspild. Pas doorgaan als de smoke een normaal antwoord geeft.
- **NOOIT** `git push origin main`, **NOOIT** mergen, **NOOIT** `--no-verify`. Commit op je branch. Aan het eind: optioneel een **draft** PR openen. Mergen/deployen is voor de ochtend.
- **NOOIT** productie-env-vars zetten, externe accounts aanmaken, of secrets genereren. Die staan in §2 als handoff. Schrijf de code die ze gebruikt + documenteer de stap.
- **Append-only bot-versies.** Maak een **nieuwe** `V0_10`-snapshot in `lib/v0/server/bots.ts`. **Muteer v0.9.3 of eerdere snapshots niet.** Tuning (prompt/gate) gebeurt in de v0.10-snapshot.
- **Kostenrem (billable OpenAI-calls).** Eval-judge = jij in-sessie ($0); wat geld kost is **bot-generatie** (de OpenAI-calls per eval-case). Gebruik altijd `--max-cost 2.50` per gate-run. **Totale eval-spend voor de nacht ≤ $15** (en **$20 = absolute noodrem**, niet je budget — het gat $15→$20 is voor incidentele niet-eval-calls zoals smoke-tests, niet voor extra gate-rondes). Itereer op de **$0 deterministische hard-eval** (over-/under-refusal zijn deterministisch gemeten, geen judge nodig); draai de volledige answer-quality-gate alleen voor tussentijdse checks en de eindverificatie. Bij dreigende overschrijding: stop met eval-runs, log het, ga door met code.
- **Niets stilletjes breken.** Vóór elke commit: `npx tsc --noEmit` schoon én een schone build (`Remove-Item -Recurse -Force .next; npm run build`) — de Windows/Turbopack-build crasht (0xC0000409) op een vervuilde `.next/`, dus altijd eerst wissen. Bestaande unit-tests blijven groen.
- **Respecteer de hard rules** uit `AGENTS.md`: `organization_id NOT NULL` + RLS bij elke nieuwe tabel/migratie; service-role alleen via `lib/supabase/admin.ts`-wrappers; geen secrets in `NEXT_PUBLIC_*`; anti-hallucinatie boven volledigheid.
- **Migraties:** volgende veilige nummer = **0046** (hoogste op `origin/main` = `0045_admin_feedback_type_anders.sql`; de dubbele `0044_*` is benigne en al gemerged). Bevestig vóór je kiest met de **`check-migration` skill** (checkt lokaal **én** open PRs) — let op: er bestaat **géén** `npm run check-migration`-script. RLS-policies in dezelfde migration.
- **Geblokkeerd ≠ vastlopen.** Kun je een item niet autonoom afronden (vereist account/prod-env/menselijk oordeel)? Schrijf het naar `HANDOFF.md`, markeer het criterium als `BLOCKED-HANDOFF`, en ga door. Niet de hele nacht op één muur blijven duwen.
- **Geen scope-creep.** Bouw alleen wat in §3–§5 staat. Items gemarkeerd `→V1` of `SHOULD (alleen als tijd over)` niet vóór de MUSTs. De analyse-docs noemen ~45 criteria; dit bestand is bewust getrimd tot de kern — volg dít. De brede kwaliteits-wishlist (meertaligheid/taal-spiegeling, tone-of-voice-in-dashboard, "menselijke toon") is **al geshipt** (PR #166/#164, #155) → **verifieer dat het werkt op de v0.10-snapshot (valt onder C13), herbouw het niet.**

---

## 2. Twee soorten werk: AUTONOOM vs HUMAN-HANDOFF

**De agent kan geen accounts aanmaken of productie-env-vars zetten.** Splits daarom:

### Jij bouwt (autonoom, code):
alle criteria in §3–§5 die `[CODE]` zijn — wiring, routes, migraties, tests, de bot-snapshot, de eval-fix, de gate-run.

### Mens doet 's ochtends (jij schrijft alleen `HANDOFF.md` met exacte stappen):
- **Upstash provisioneren** → account → Redis-DB (regio EU/Frankfurt) → `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` + `USE_UPSTASH=true` in Vercel prod.
- **`EMBED_TOKEN_SECRET`, `CRON_SECRET`** in Vercel prod zetten (genereer geen echte secrets in de repo; documenteer dat ze gezet moeten worden).
- **UptimeRobot** (gratis) → monitor op `https://www.chatmanta.nl/api/v0/widget/ping` → alert-mail.
- **OPENAI_ADMIN_KEY** (optioneel, graceful fallback bestaat) en **FIRECRAWL_API_KEY** verifiëren op prod.
- **DPA-template + sub-processor-lijst** juridisch laten tekenen (jij levert alleen het concept-document).
- **Push-alerting (UITGESTELD — known limitation).** v0.10 heeft GEEN push-alert als de bot fouten spuwt of geld verbrandt (alleen de in-app Issues-tab + UptimeRobot-ping). Documenteer dit expliciet als launch-preconditie: tot er een alert is (bv. een Resend-mail bij budget-cap-hit + error-rate-spike), moet de operator het dashboard handmatig monitoren. Bouw dit NIET nu (bewuste scope-keuze); noem het als #1 post-launch-ops-item.
- **Launch-preconditie multi-tenancy (HARD).** Het publieke embed-pad is veilig (per-org HMAC embed-token gebonden aan de URL-slug — cookie/`?org=`-switch faalt met 401). MAAR de cookie-authed demo/admin-surface laat vrij org-switchen (de `V0_DEMO_PASSWORD`-sandbox). **Zet echte klantdata NOOIT in een demo-bereikbare sandbox-org.** Dit is de dragende veiligheidsgrens voor testklanten — niet C10. Leg het vast als expliciete preconditie, niet als code-comment.

`HANDOFF.md` moet voor elk handoff-item bevatten: wat, waarom, exacte stap, en hoe te verifiëren dat het werkt.

---

## 3. Prereqs — eerst dit, anders is de eindgate betekenisloos

### P1 — Basis op v0.9.3 `[CODE]`
- **Klaar wanneer:** je branch is gebaseerd op `origin/main`; `LATEST_BOT_VERSION` toont nog v0.9.3 (je verzet hem pas in §6).
- **Verifieer met:** `git show origin/main:lib/v0/server/bots.ts | Select-String "LATEST_BOT_VERSION ="` → `V0_9_3.version`.

### P2 — Judge-fix (#168) verifiëren + baselines opnieuw meten `[CODE/verify]`
**#168 is al gemerged** (`ce25dbc` op `origin/main`): de judge zag voorheen per case maar een ~1200-char excerpt → gegrond-getal-cases werden false-fails (zelfs de bevestigd-JA v0.8.1 zakte daardoor in de 2026-06-02 run). Nu krijgt de judge de **volledige parent_content** (`includeFullParentContent: true`, caps `JUDGE_SOURCE_PER = 8000` / `JUDGE_SOURCE_TOTAL = 24000` in `scripts/v0-hard-eval-run.ts`). **Dit is dus géén bouwwerk meer — het is verifiëren + her-ijken.** De oude verdict-getallen die je je misschien herinnert (v0.9.2 = JA ~93%, v0.8.1 = NEE) zijn **PRE-#168 en nu mogelijk stale**.
- **Doe:** bevestig dat de caps op main 8000/24000 zijn. Stel je baselines **empirisch** opnieuw vast met één gate-run op je referentieset — vertrouw geen onthouden getal. Leg in `eval-out/hard/` vast welke versie nú welk verdict + AQ% haalt; die verse tabel is je ijkpunt voor de v0.10-vergelijking.
- **Klaar wanneer:** caps geverifieerd op 8000/24000; je hebt een verse baseline (versie → AQ% → safety-veto's) voor minimaal **v0.9.2 en v0.9.3** (de regressie-referenties; v0.8.1 optioneel als er budget over is).
- **Verifieer met:** `npm run eval:hard:run -- --versions=v0.9.2,v0.9.3 --max-cost 2.50` → gegronde-getal-cases false-failen niet meer; de overgebleven answer-quality-fails zijn échte fabricaties. Spot-check 2–3 fails handmatig tegen `scripts/fixtures/sandbox-orgs/*`.

### P3 — v0.10-snapshot aanmaken `[CODE]`
- **Doe:** kopieer v0.9.3 naar een nieuwe `V0_10`-config in `bots.ts` (append-only). Dit is de versie waarin je in §5 de over-refusal tunet. Registreer 'm overal waar versies geregistreerd worden (`BOT_VERSIONS_ORDERED` is een handmatige array; `EVAL_DEFAULT_VERSIONS = …slice(-2)` pakt 'm dan automatisch). **Let op:** een `query_log.bot_version` CHECK bestaat NIET (geen migratie nodig), maar `scripts/test-bot-defaults.ts` hardcodeert de versie-array + `LATEST` → werk die mee bij, anders breekt `npm test`.
- **Klaar wanneer:** `tsc` schoon; `resolveBot('v0.10')` werkt; een smoke-vraag geeft een normaal antwoord; `npm test` groen.

### P4 — Over-refusal-meting betrouwbaar maken (vóór je C11 tunet) `[CODE]`
De huidige over-refusal-maat is **niet betrouwbaar genoeg om op te tunen**: in `lib/v0/server/hard-eval-checks.ts` bepaalt `looksLikeRefusal` (een **regex**) of een antwoord een weigering is, gemeten op **alléén `results[0]`** (de eerste run). Twee meetfouten: (a) een correct antwoord met "neem contact op voor een offerte" matcht de regex → telt vals als over-refusal; (b) bij stochastische generatie (temp ≠ 0, geen seed) flipt een grensgeval tussen runs. Met n=30 is 1 case = 3,3%, dus deze ruis maakt "13%→≤5%" onmeetbaar.
- **Doe:** tel over-refusal op het **échte refusal-event** (het deterministische `claim-regenerate`/answer-replacement-signaal uit de hard-fact-gate, niet de regex op de antwoordtekst) **en** aggregeer over de N runs (**majority-of-N**, niet `results[0]`). Behoud de bestaande dimensie-/gate-structuur; dit is een meet-fix, geen gate-wijziging.
- **Klaar wanneer:** een over-refusal-hit komt aantoonbaar uit een echte gate-weigering (niet uit een CTA-zin); de maat is stabiel over 2 identieke runs op v0.9.3.
- **Verifieer met:** draai de hard-eval 2× op v0.9.3 ná de fix → de over-refusal-count is identiek en elke gemarkeerde case is bij handmatige check een échte weigering. Pas hierna is C11's ≤5%-doel betekenisvol meetbaar.

---

## 4. v0.10 code-criteria (MUST) — de productie-hardening

Volgorde = bouwvolgorde. Elk item: `[CODE]` (autonoom) of `[CODE + HANDOFF]` (jij bouwt, mens zet env). Elk heeft "Klaar wanneer" + "Verifieer met".

### Stage 0 — vangnet & infra-ready

**C1 — CI verificatie-build `[CODE]`**
Maak `.github/workflows/build.yml`: `npm ci` → `next build` op een schone runner (geen dev-server). Minimaal, geen lint/coverage.
- Klaar wanneer: valide YAML; lokaal bewijst `Remove .next; npm run build` groen.
- Verifieer met: schone build groen + `npx tsc --noEmit` schoon.

**C2 — DEPLOY.md compleet + startup-assert `[CODE + HANDOFF]`**
Vul `DEPLOY.md` aan met álle prod-env-vars (`EMBED_TOKEN_SECRET`, `USE_UPSTASH`, `UPSTASH_REDIS_REST_URL/_TOKEN`, `CRON_SECRET`, `OPENAI_ADMIN_KEY`, `FIRECRAWL_API_KEY`). Bouw een **startup-assert** in `instrumentation.ts` (bestaat, met `register()` gegate op `NEXT_RUNTIME === 'nodejs'` = het juiste bootstrap-punt): bij ontbrekende **`EMBED_TOKEN_SECRET`** → harde fout (fail-closed); bij `USE_UPSTASH=true` maar ontbrekende Redis-vars → luide fout i.p.v. stille in-memory fallback. *(Dit is écht nieuwbouw: vandaag faalt een ontbrekende `EMBED_TOKEN_SECRET` STIL-closed — `verifyEmbedToken` geeft `false` zonder log → de hele publieke widget gaat 401-zwart zonder signaal. Daarom luid falen.)*
- Klaar wanneer: assert-code aanwezig + unit/integration-test die de faal-paden dekt; DEPLOY.md volledig.
- Verifieer met: test groen; HANDOFF.md beschrijft het zetten van de vars.

### Stage 1 — geld-kraan & misbruik (de publieke widget kost nu al echt geld)

**C3 — Per-org dag-budget-cap in USD `[CODE]`**
Voeg vóór de RAG-pipeline in `app/api/v0/chat/route.ts` een check toe: som `query_log.cost_usd` voor de org over de huidige dag; bij overschrijding van een **configureerbare USD-dagcap** → weiger de LLM-call en stuur een net `budget_exhausted` stream-event / HTTP 402. **Reken in USD** (de meting bestaat al; EUR hangt aan de niet-gebouwde `callLLM()` — niet doen). **⚠ Twee correctheids-vallen:** (1) `logQuery` is best-effort/never-throws en draait ná de stream in een `after()`-block — faalt die insert (juist de failure die kosten laat ontsporen), dan landt `cost_usd` niet en trekt de cap nooit. Koppel de cap dus niet blind aan die som als enige rem; overweeg de cap-overschrijding ook luid te loggen. (2) Naïef "lees de dag-som" is racy: N gelijktijdige streams lezen allemaal de pre-increment-som en passeren allemaal — accepteer dat een kleine overschoot mogelijk is, maar zorg dat de cap onder aanhoudende load wél dichtklapt.
- Klaar wanneer: cap configureerbaar per org (default ruim, bv. $2/dag); bij overschrijding 0 LLM-calls. *(Er bestaat nog geen `daily_budget_usd`-kolom — kies de kleinste optie: een const-default + optionele env-override; voeg pas een migratie (0046 + RLS) toe als een echte per-org-waarde nodig is, niet "voor de zekerheid".)*
- Verifieer met: zet cap op $0.01 voor een test-org, stuur 5 requests via `npm run v0:chat` of een testscript → request 2+ krijgt budget-exhausted, geen LLM-antwoord, geen 500.

**C4 — Graceful degradatie in de widget `[CODE]`**
De widget toont een leesbare NL-melding bij `budget_exhausted`, `RATE_LIMIT`, `LLM_TIMEOUT`, `NOT_FOUND` — geen JSON-blob, geen bevroren spinner. **⚠ Bestaande bug om te fixen (geen verificatie):** `app/widget/components/chatmanta-widget.tsx` checkt nu `code === 'RATE_LIMITED'`, maar de echte `AppError`-code is **`'RATE_LIMIT'`** (`app-error.ts`) → die tak is dóde code, een echte rate-limit toont nu de generieke "Er ging iets mis". `budget_exhausted`/`LLM_TIMEOUT` worden niet apart afgehandeld. C4 is dus een echte fix.
- Klaar wanneer: elke `AppError`-code mapt op een leesbare boodschap + (waar zinvol) retry; de `RATE_LIMIT`-mismatch is weg.
- Verifieer met: simuleer elk geval; widget toont de juiste melding.

**C5 — Injection block op embed: verifiëren (GEEN bouwwerk) `[CODE]`**
Het embed-pad blokkeert injection al hardcoded (`route.ts`: `isCookieAuthed(req) ? getInjectionMode() : 'block'`). Voeg alleen een **unit-test** toe die deze branch borgt. (Patroon-tuning = post-launch, niet nu — er is nog geen echte traffic.)
- Klaar wanneer: test bewijst dat een niet-cookie (embed) request altijd `'block'` krijgt.

**C6 — Upstash live-ready `[CODE + HANDOFF]`**
De code is klaar (`lib/v0/server/rate-limit.ts`). Jij: zorg dat de startup-assert (C2) de ontbrekende Upstash-vars luid maakt en documenteer de provisioning in HANDOFF.md. Het daadwerkelijk live zetten = handoff.
- Klaar wanneer: code + assert + HANDOFF-stap aanwezig. (Live-verificatie = ochtend.)

### Stage 2 — AVG-codelaag (echte bezoeker-data stroomt al door de widget)

**C7 — PII-redactie bedraden in `logQuery()` `[CODE]`**
`redactPii()` bestaat (`lib/observability/redact.ts`) maar wordt niet aangeroepen in `lib/v0/server/log.ts`. Pas het toe op `query_log.question` (en overweeg `answer`). *(Correctie van eerdere aanname: de flag zit NIET in `v0_org_settings`/`getOrgSettings`. Een per-org flag `pii_redaction_enabled` bestaat al in **`admin_privacy_settings`** via `lib/controlroom/server/privacy.ts` — bedraad daarheen. Let op: `logQuery` heeft alleen `organizationId` (UUID); die lookup vereist een org-id → een passende key. Lukt de bedrading niet schoon binnen budget, val terug op **default-aan via const** (redacteer altijd) — geen nieuwe settings-tabel/migratie.)*
- Klaar wanneer: `logQuery` redacteert; flag stuurt het gedrag.
- Verifieer met: test/insert met een e-mail+telefoon in de vraag → `query_log.question` bevat geen ruwe PII.

**C8 — Retentie-cron `[CODE + HANDOFF]`**
`lib/controlroom/server/retention.ts` is af maar niet gekoppeld. Maak een cron-route (`app/api/cron/retention/route.ts`, `CRON_SECRET`-gated) die `runRetentionCleanup()` draait; voeg een dagelijkse entry toe aan `vercel.json` (let op: Vercel Hobby = max 2 crons, alléén dagelijks — daily past). Documenteer `CRON_SECRET` als handoff.
- Klaar wanneer: route + vercel.json-entry; dry-run draait foutloos.
- Verifieer met: lokale aanroep met geldige secret → anonimiseert rijen ouder dan de termijn; zonder secret → 401.

**C9 — Widget-bezoeker disclosure + verwijderpad `[CODE]`**
Toon in de widget een minimale disclosure (bv. "Chat wordt tijdelijk opgeslagen voor hulpverlening" + link naar `/privacy`). Bouw een delete-endpoint dat alle rijen in `v0_threads`/`v0_thread_messages` voor een gegeven `visitor_id` verwijdert (org-gescoped). Voeg de per-org privacy-link hierin samen. *(⚠ Groter dan een banner: `/privacy` bestaat nog NIET, er is GEEN delete-by-visitor functie (`deleteThread` is thread-id-gebaseerd), en `v0_thread_messages` heeft GEEN `organization_id` — org-scope moet via een JOIN op `v0_threads` (zie `retention.ts` voor het patroon). Dus: nieuwe publieke pagina + nieuwe org-gescopte delete-functie/-endpoint + cascade. Stem af met C8: retention anonimiseert org-breed op leeftijd, C9 verwijdert op visitor-id — geef "delete" niet twee conflicterende betekenissen.)*
- Klaar wanneer: disclosure zichtbaar; delete-endpoint verwijdert de juiste rijen en niets van een andere org.
- Verifieer met: integration-test of script: maak een thread → delete per visitor-id → 0 rijen over voor die visitor, andere orgs onaangeroerd.

### Stage 3 — isolatie vooruithardt (V1-prep, maar een echte V0-bug)

**C10 — `orgId` niet-optioneel op de productie-surface `[CODE]`**
Meerdere functies hebben `organizationId: string = DEV_ORG_ID` (default-param staat o.a. in `lib/v0/server/rag.ts`, `lib/v0/server/log.ts`, `lib/v0/server/threads.ts`). Maak `orgId` **verplicht** op de publieke surface (`runRagQueryStreaming`, `logQuery`); behoud een interne default **alleen** voor de bewuste eval-/cross-org-paden (`eval.ts`). **Inventariseer eerst álle callsites** — grep beide spellingen: `git grep -nE "organizationId: string = DEV_ORG_ID|orgId: string = DEV_ORG_ID" -- lib/` — zodat je geen eval-scripts of `v0:chat` breekt. Zet de grep-lijst in de PR-omschrijving.
- Klaar wanneer: geen productie-pad valt stil terug op `DEV_ORG_ID`; eval/scripts werken nog.
- Verifieer met: grep-lijst in de PR-omschrijving; `npm run eval:hard:run` + `npm run v0:chat` werken; `tsc` schoon. *(Geverifieerd: dit breekt niets — alle productie-/eval-callsites van `runRagQueryStreaming`/`logQuery` geven `organizationId` al expliciet door en `v0:chat` raakt deze functies niet. Het is wél een grotere typecheck-cascade (≈10 callsites in rag/log/threads) dan "2 functies" — onderschat de omvang niet.)*

---

## 5. v0.10 bot-kwaliteit (MUST) — de reden dat het een botversie is

**C11 — Over-refusal tunen zonder fabricatie te herintroduceren `[CODE]`**
v0.9.3 weigert te vaak (pre-#168-meting: ~13% vs v0.8.1 ~3% op beantwoordbare vragen). **Meet eerst opnieuw met de P4-fix** — vertrouw het 13%-getal niet blind. **Mechaniek (geverifieerd):** de over-refusal komt uit één deterministische gate, `hardFactDeterministicRefusal` in `lib/v0/server/hard-facts.ts`, die afgaat bij `retrievalStrength` = 'weak'/'medium' (top1Sim < ~0,56) **én** een niet-exact-gematcht getal — en dan het **hele** antwoord vervangt. Voor NL + `text-embedding-3-small` landen gegronde antwoorden routinematig in 0,50–0,56 = de gevarenzone. **Veilige, hoge-hefboom-lever:** vuur alleen op écht zwakke retrieval (drop 'medium'), en/of key de gate op de **fabricatie-klasse** (geld/percentage/datum) i.p.v. álle getallen — niet de systemprompt slopen. Tune in de v0.10-snapshot zodat over-refusal daalt **terwijl** fabricatie op de safety-buckets **0 blijft** en de named regressies (112-handoff, €295/€4,20-klasse) groen blijven.
- **⚠ Verwachting (eerlijk):** met n=30 (1 case = 3,3%) en een judge-afhankelijke JA is **≤5% niet hard te certificeren**, ook ná P4. De realistische uitkomst is vaak de **§6.3-fallback**: over-refusal aantoonbaar lager dan v0.9.3 + 0 fabricatie + gap-analyse. Forceer geen JA door de gate los te draaien — kies veiligheid (§7).
- **Verifieer de over-refusal-hits HANDMATIG** vóór je her-tunet: lees elke gemarkeerde case en bevestig dat het een échte weigering is (geen CTA-false-positive die P4 zou moeten wegnemen).
- Klaar wanneer: over-refusal op v0.10 (P4-meting) < v0.9.3 **én** 0 fabricaties/must-not-schendingen op de safety-dimensies; richt op ≤5% maar accepteer de fallback als de meting het niet hard maakt.
- Verifieer met: `npm run eval:hard:run -- --versions=v0.9.3,v0.10 --max-cost 2.50` → v0.10 over-refusal < v0.9.3, safety-veto schoon.

**C12 — Hard-fact-gate stabiel op v0.10 `[CODE]`**
Geen verzonnen getallen/prijzen/datums/URLs door de gate; geen false-positieve weigering op correct-beantwoordbare of nood-/handoff-antwoorden (112-klasse). *(⚠ Fixture-gap: de letterlijke €295/€4,20-cases staan NIET in `eval-fixtures/hard-dimension-cases.json` — de fabricatie-klasse wordt geborgd door de 3 out-of-corpus `aoc-*`-cases (Acme-spoedtoeslag, Globex-parkeerkosten, Initech-naheffing). Gebruik die als de fabricatie-guard; voeg alléén een letterlijke €295/€4,20-case toe als het triviaal is. Under-refusal leunt op slechts 3 cases (< `UNDER_REFUSAL_MIN_N`=8) → het is advisory, geen statistisch signaal; vertrouw ook op de safety-judge. 112-handoff is wél gedekt (4 human-handoff-cases incl. de mixed-intent-regressie).)*
- Klaar wanneer: de bestaande deterministische safety-checks zijn 100% op v0.10; de 3 `aoc-*`-fabricatie-cases + de 112-handoff-cases groen.

**C13 — UX-discipline geverifieerd op de bevroren v0.10-bot `[CODE/verify]`**
Directe antwoorden (BLUF, geen opvultekst) en zichtbare streaming zonder tag-lekken, op alle paden (normaal/smalltalk/fallback). Dit is verificatie, geen nieuwbouw.
- Klaar wanneer: spot-check + de gate-dimensies (taal/typo/meta-talk) tonen geen regressie t.o.v. v0.9.3.

*(SHOULD — alleen als tijd over, anders → HANDOFF als "post-v0.10":* follow-up-chips renderen in de embed-widget; `widget.js` `Cache-Control: max-age ≤300`; `hardFactSupport`→`eval_runs`.)*

---

## 6. Definition of Done

### Agent-DoD (jij moet dit halen vóór je stopt)
1. P1–P4 + alle MUST (C1–C13) afgerond of expliciet `BLOCKED-HANDOFF` met reden in `HANDOFF.md`.
2. `tsc --noEmit` schoon + schone `next build` groen + bestaande unit-tests groen + jouw nieuwe tests groen.
3. **Eind-gate op v0.10** (mét de P2-fix), `--max-cost 2.50`, runs=3 op de kandidaat:
   - **Streefuitkomst:** `PRODUCTIEWAARDIG: JA` op v0.10 — 0 safety-veto's, answer-quality ≥ drempel, over-refusal ≤ ~5%, en regressie-diff t.o.v. v0.9.2/v0.9.3 toont **geen nieuwe** safety-fails.
   - **Fallback (een volwaardige, wáárschijnlijke uitkomst — geen mislukking):** een schone automated JA is met n=30 + judge-afhankelijke drempel vaak niet hard te halen. Lever dan v0.10 dat op **élke deterministische as ≥ v0.9.3** is (no-fabricated-specifics ≥ v0.9.3, over-refusal < v0.9.3 op de P4-meting, niet trager) en schrijf een eerlijke **gap-analyse** in `HANDOFF.md` (welke cases, judge-afhankelijk of echt, waarom). Verzin **nooit** een PASS en draai geen extra gate-rondes om er een te forceren (≤ ~2 betaalde eind-gates binnen de $15-cap). Bewaar de run-output in `eval-out/hard/`.
4. Pas **ná** een groene/▲-acceptabele gate: zet `LATEST_BOT_VERSION = V0_10.version` **op je branch** (niet mergen, niet deployen).
5. Lever op je branch: alle commits, `HANDOFF.md`, en een korte `V0_10_BUILD_REPORT.md` (wat groen, wat geblokkeerd, gate-uitkomst, eval-spend, open beslissingen voor de ochtend). Optioneel: een **draft** PR.

### Launch-DoD (mens, 's ochtends — buiten jouw bereik)
Provisioning uit §2 uitvoeren (Upstash live, env-vars, UptimeRobot, DPA tekenen), dan de PR reviewen + mergen + deployen. Pas hierna is v0.10 daadwerkelijk live-/V1-ready.

---

## 7. Werkwijze-tips (om de nacht productief te houden)
- Werk **stage voor stage**, commit per criterium. Een groene `tsc`+build na elk item voorkomt dat een latere fout de hele nacht besmet.
- Draai dit als **één sequentiële implementer** (geen parallelle file-editors op `bots.ts` — die racen en breken de tsc/build-gates); zet subagents in als **advies** op beslispunten (RAG-tuning C11, AVG-laag C7–C9) en sluit af met een **review-loop** (`/code-review` ⇄ Codex). Edit `bots.ts` **nooit** terwijl een `eval:run`/`eval:hard:run` loopt — tsx crasht dan met exit 9 en de run is onbruikbaar; behandel exit-9 als tooling-botsing, niet als bot-regressie (opnieuw draaien, niet her-tunen).
- Itereer op bot-kwaliteit (C11/C12) met de **$0 deterministische hard-eval** (over-/under-refusal zijn deterministisch gemeten, geen judge nodig). Bewaar de dure full-AQ-gate voor tussenijk en de eindverificatie.
- Houd een lopende `V0_10_BUILD_REPORT.md` bij terwijl je werkt — niet pas aan het eind.
- Twijfel je of iets een human-handoff is? Als het een account, een prod-secret, of een externe dienst aanmaakt → **handoff**. Bouw de code eromheen klaar en ga door.
- Raak je geblokkeerd op een bot-kwaliteitsdoel (C11 lukt niet zonder fabricatie te herintroduceren)? Kies veiligheid: liever iets meer over-refusal dan één fabricatie. Documenteer de trade-off.
