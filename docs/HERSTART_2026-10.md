# ChatManta — Herstart-draaiboek (oktober 2026)

> **Voor wie:** Sebastiaan (en Niels voor zijn deel), na ~2,5 maand stilstand (laatste commit: 26 juli 2026).
> **Opgesteld:** 5 oktober 2026, op basis van git-historie, `docs/V1_LAUNCH_TODO.md`, `plans/README.md`, de Command Center-milestones, CC-memory **en een live gezondheidscheck van vandaag** (§4).
> **Hoe gebruiken:** loop het van boven naar beneden door en vink af. Elke stap zegt **wie** (🧑 jij · 🤝 Niels · 🤖 Claude kan het doen) en **hoe lang** ongeveer.

---

## 1. In één minuut: waar sta je?

- **De software is af.** V1 (de echte productversie met eigen login per klant, aparte database, widget, klant- en admindashboard) is **code-compleet** en draait live op `www.chatmanta.nl`. Tussen 24 juni en 26 juli zijn ~50 PR's gemerged.
- **Er zit nog precies één echte code-blocker in de weg:** een beveiligingslek waarmee elke ingelogde V1-gebruiker zichzelf admin kan maken. De fix ligt al klaar in **PR #254** — hij moet alleen nog op de productiedatabase gezet en gemerged worden.
- **Alles daarna is ops, juridisch en klanten-onboarding** — geen bouwwerk meer. De lijst staat in §5.
- **Je infrastructuur leeft nog** (site, databases, OpenAI, SSL, domeinen — zie §4). Alleen je **Vercel-login op deze PC is verlopen** en een paar dingen kon ik niet van buitenaf checken.
- **Grootste niet-technische gat:** Jorion Solutions staat **nog niet bij de KVK**. Dat moet vóór je de eerste factuur stuurt (zie stap D1).

**Fase in het bouwplan (8 fases):** fase 0–7 zijn voor V1 af. Je zit in **fase 8: "Polish & Go-live"** — specifiek in het stuk *pre-klant-gates + onboarding*.

---

## 2. Wat was het plan ook alweer?

| Onderdeel | Afspraak |
|---|---|
| **Product V1** | Alléén een betrouwbare website-chatbot voor klantvragen: widget + kennisbank (website-crawl + documenten) + klantdashboard + chatlogs + basisstatistiek + veilige "ik weet het niet"-fallback. **Géén** boekingen, betalingen, CRM of complexe flows (dat is V2). |
| **Eerste klanten** | 3 friends & family-testklanten: **ActionSpeedControl** (vader), **Cleans Reinigingen** (neef), **Maxus Studios** (vriend). Eerste maand gratis, daarna vriendenprijs **€20–30/mnd**, handmatige betaling. *(Bevestigd 5 okt: klopt nog.)* |
| **Launch-aanpak** | **Alle 3 tegelijk** *(jouw keuze 5 okt — zie de extra voorzorg in stap E1)*. |
| **Rollen** | **Sebastiaan** = Product & Tech (alles met code, hosting, kwaliteit). **Niels** = Customer & Launch Lead (klanten, onboarding, verwachtingen, juridisch, support). **Samen** = scope en Go/No-Go. *(Bevestigd: Niels is nog actief.)* |
| **Go/No-Go-lat** | Per klant **≥ 80% goede antwoorden** en **0 kritieke hallucinaties** (bot verzint geen feiten). |
| **LLM** | V1 draait op OpenAI **gpt-4o-mini**. Claude Haiku als backup + automatische fallback = bewust V2. |
| **Budget-vangrail** | Per klant een dag-budget (nu **€1/dag**) + maandlimiet op berichten — voorkomt een kostenexplosie als iemand de widget misbruikt. |

> **Analogie:** het huis is gebouwd en de sleutels liggen klaar. Wat nog moet is: één slot vervangen (PR #254), de nutsvoorzieningen controleren (§4), de verzekering en het huurcontract regelen (juridisch) en de bewoners verhuizen (onboarding).

---

## 3. Wat is er al gedaan? (tijdlijn)

| Periode | Wat | Bewijs |
|---|---|---|
| mei–juni 2026 | **V0** = leer-/testplatform voor de RAG-techniek (RAG = de bot zoekt eerst relevante stukjes uit de kennisbank en laat de AI daarop antwoorden). Botversies v0.4 → **v0.10** (97% op de kwaliteitsgate), crawler, embeddable widget, contactverzoeken, admindashboard, maandrecap-PDF, quiz, feedbacksysteem. | PR's t/m #206 |
| 24–29 jun | **V1-fundament**: aparte Supabase-database "ChatManta V1-prod", echte login per gebruiker, RLS (= database-regels die afdwingen dat klant A nooit data van klant B ziet), RAG-kern, ingest, crawler. | PR #208–#222 |
| 29 jun–1 jul | **V1 scope-compleet**: widget, onboarding, document-upload, budget-cap, rate-limit, telemetrie, Sentry-bedrading. Eval geslaagd. | PR #223–#229 |
| 1 jul | **Ops**: `IP_HASH_SALT`, nieuwe `CRON_SECRET`, cron-job.org-pinger voor crawls (elke 5 min), proxy-fix. | PR #231 |
| 4–6 jul | Launch-audit → 6 schemabugs gefixt; **V0-uiterlijk + V0-pariteit** voor klant- en admindashboard. | PR #230, #233–#238 |
| 4–7 jul | **Dashboard-gaten** (5-agent-onderzoek → 4 golven): widget-heartbeat/pauzeer, correctieloop, contactverzoek-mail, admin-cockpit, CSV-export, operator-suspend, telemetrie. Migraties 0022–0025 op V1-prod. | PR #239–#249 |
| 6–8 jul | **Fable-dag**: herhaalde security-audit → vond het admin-escalatielek + 5 kleinere plannen (011–015). | PR #252 |
| 25–26 jul | Plan 010 (Command Center-bug) gemerged; **plan 011 (het lek) code-klaar in PR #254 — wacht op jouw go.** | PR #253, #254 |

---

## 4. Gezondheidscheck derde partijen (gecheckt op 5 okt 2026)

| Dienst | Waarvoor | Status vandaag | Wat jij nog moet doen |
|---|---|---|---|
| **Vercel** (hosting) | Draait de site | ✅ Site live: `www.chatmanta.nl` antwoordt, `chatmanta.nl` → www, `/v1/login` 200, `widget-v1.js` 200 | ✅ CLI-login hersteld (5 okt). Laatste prod-deploy = 26 jul (PR #252), status Ready, gekoppeld aan www + apex. Alle benodigde env-vars staan op prod (`CRON_SECRET`, `EMBED_TOKEN_SECRET`, `IP_HASH_SALT`, `FIRECRAWL_API_KEY`, `OPENAI_API_KEY`, `RESEND_*`, `UPSTASH_*`, `V1_*`). Ontbreekt alleen `SENTRY_DSN` (bekend). Geen errors in de beschikbare logs. Nog steeds aanwezig: het onbekende `POSTGRES_*`/`SUPABASE_*`-cluster (waarschijnlijk een Vercel↔Supabase-integratie, ongebruikt). | Abonnement/betaalmethode checken. Optioneel: kijken of die Supabase-integratie los kan. |
| **Supabase V1-prod** (`tfijdnxqdvwzwgxdioqo`) | Database V1 | ✅ Actief (niet gepauzeerd). Inhoud: alleen 2 seed-orgs + 3 test-users. Laatste crawl-job: 28 jun. `query_log` V1 = leeg (nog nooit echt verkeer). | Inloggen op dashboard, check: tier (free), auth-templates (stap C4), advisors-tab. |
| **Supabase V0** | Database V0-demo | ✅ Actief. Laatste chat: 18 jun. | Niets — blijft speeltuin. |
| **OpenAI** | Het AI-model | ✅ API-key geldig (lokaal getest) | Check **credit/billing-saldo** + of auto-recharge aanstaat, en of `gpt-4o-mini` nog niet als "deprecated" gemarkeerd is. |
| **cron-job.org** | Pingt elke 5 min de crawl-verwerking | ✅ **Crawl-pinger draait**: Vercel-logs tonen elke ~5 min `GET /api/v1/cron/process-crawls 200`. De dagelijkse faq-snapshot-job is niet te zien (logs reiken maar ~1 uur terug). | Inloggen en checken of de faq-snapshot-job ook nog aan en groen is. |
| **Firecrawl** | Website-crawler | ✅ Account actief (5 okt): **1058 credits** over, free-plan 1000/mnd, reset elke 24e van de maand. Eén klant-crawl = max 50 credits → 3 klanten ruim gedekt. MCP gekoppeld. | Geen actie. Bij meer klanten/recrawls: plan-upgrade overwegen. |
| **Resend** | Uitgaande e-mail (contactverzoeken, feedback) | ✅ DNS-records voor chatmanta.com staan er nog (DKIM `resend._domainkey`, SPF + MX op `send.`, DMARC) → verificatie hoort intact te zijn. MCP gekoppeld. Afzenderdomein = **chatmanta.com** (niet .nl!). | Laatste zekerheid: 1 echte testmail bij stap E6. |
| **Upstash** (Redis) | Rate-limiting | ✅ **Hersteld 5 okt.** De oude free-database was door inactiviteit verwijderd (site viel stil terug op per-server-tellers). Nieuwe DB `chatmanta-ratelimit` (Frankfurt) aangemaakt, URL+token op Vercel prod+preview gezet, redeploy gedaan. Live geverifieerd: burst op `/api/v1/chat` → 30× 401, daarna 429; teller staat in Redis. | ⚠️ **Valkuil:** een free-DB wordt na lange stilte verwijderd. Na launch houdt echt verkeer hem actief; bij een nieuwe stille periode opnieuw checken. |
| **Sentry** | Foutmeldingen | ❌ **Nooit aangezet** (`SENTRY_DSN` ontbreekt) | Optioneel vóór launch, sterk aanbevolen bij 3 klanten tegelijk (stap C6). |
| **Better Stack** (vervangt UptimeRobot) | Waarschuwt als site down is | ✅ **Opgezet 5 okt** (gratis plan): monitors op `/v1/login`, `/widget-v1.js`, `/widget.js`; alarm naar Sebastiaan@chatmanta.com. | Statuspagina pas bij betalende klanten. |
| **Domein chatmanta.nl** | Hoofddomein (TransIP) | ✅ DNS bij TransIP, SSL-certificaat geldig t/m **10 dec 2026** (Vercel vernieuwt automatisch) | Niets. |
| **Domein chatmanta.com** | Mail-afzender + redirect | ✅ Geregistreerd t/m **10 mei 2027**. Redirect naar chatmanta.nl werkt. ❌ **Nog steeds geen MX-records** → mail aan `…@chatmanta.com` bounct. | Stap C5. |
| **GitHub** | Code | ✅ `gh` werkt. 2 open PR's: **#254** (security, belangrijk) en #207 (devcontainer, draft, niet nodig voor launch). | — |

---

## 5. Stappenplan — terug op koers en naar launch

### Fase A — Weer opstarten (±30 min) · 🧑 + 🤖

- [x] **A1. Vercel-login vernieuwen** · 🧑 *(gedaan 5 okt)* — typ in Claude Code: `! vercel login`. *(Device-flow, geen wachtwoord in de chat.)*
- [x] **A2. Laat Claude de rest-check doen** · 🤖 *(gedaan 5 okt — zie §4)* — env-vars op Vercel prod (`vercel env ls production`), laatste deploy groen, geen runtime-errors.
- [x] **A3. Lokale repo bijwerken** · 🤖 *(5 okt: npm ci + typecheck + build groen)* — `main` loopt gelijk met origin; `npm ci`, `npm run typecheck`, `npm run build` om te zien of alles na 2,5 maand nog bouwt.
- [x] **A4. Opruimen** · 🤖 *(5 okt: gaps-plan weggegooid; PR #207 blijft voorlopig open)* — `docs/DASHBOARD_GAPS_PLAN_2026-07.md` staat ongetrackt in de repo (het plan is al volledig uitgevoerd → archiveren of weggooien). PR #207 (devcontainer): laten liggen of sluiten.
- [x] **A5. Dependency-check** · 🤖 *(5 okt: Next 16.2.6 had 3 kritieke RCE-lekken + middleware-bypass → PR #256 gemerged: Next 16.3.8 + `npm audit fix`, 0 kwetsbaarheden)* — `npm audit` + kijken of Next.js/Supabase/OpenAI-SDK security-updates hebben uitgebracht sinds juli. Alleen security-fixes meenemen, geen grote upgrades vlak voor launch.

### Fase B — Derde partijen nalopen (±45 min) · 🧑

Doe dit met de tabel in §4 ernaast. Per dienst: **inloggen → account actief → betaalmethode geldig → service groen.**

- [x] **B1. Vercel** — abonnement + betaalmethode, laatste productie-deploy groen. *(5 okt: draait op **Hobby**. ⚠️ Hobby is volgens de Vercel-voorwaarden alleen voor niet-commercieel gebruik → vóór de eerste **betalende** klant naar Pro (~$20/mnd); zie E8.)*
- [x] **B2. Supabase** — *(5 okt via MCP: beide projecten ACTIVE_HEALTHY. V1-advisors: 1× WARN leaked-password-protection uit → stap C4; 13× INFO "RLS zonder policy" op admin-/systeemtabellen = bewust (alleen service-role mag erbij, deny-all voor gebruikers). Tier/billing nog zelf checken.)*
- [x] **B3. OpenAI** *(5 okt: maandlimiet ingesteld; saldo $8 — ruim genoeg voor de pilot, maar zet auto-recharge aan of vul bij vóór launch, anders stopt de bot bij $0)* — saldo + usage-limiet (zet een maandlimiet van bv. $20 als vangnet) + modelstatus gpt-4o-mini.
- [x] **B4. cron-job.org** *(5 okt: beide jobs aan + groen)* — beide jobs aan + laatste runs groen (`200`). Staat er een uit? Zet aan; URL moet exact `https://www.chatmanta.nl/...` zijn (met https én www — cron-job.org volgt geen redirects).
- [x] **B5. Firecrawl** — *(5 okt: actief, 1058 credits)*
- [x] **B6. Resend** — *(5 okt: DNS-records intact)*
- [x] **B7. Upstash** — *(5 okt: was verwijderd → nieuwe DB aangemaakt + live geverifieerd)*
- [x] **B8. TransIP** — beide domeinen staan op auto-verlenging. *(5 okt: bewuste keuze — **geen** auto-verlenging, Sebastiaan betaalt maandelijks handmatig. Risico: één gemiste betaling = domein (en daarmee site, widget én mail op chatmanta.com) eruit. Zet een terugkerende agenda-herinnering.)*

### Fase C — Launch-blockers dichtzetten (±1 dagdeel) · 🧑 + 🤖

- [x] **C1. 🔴 Security-lek dichten: PR #254 (plan 011)** *(5 okt: migr 0026 op V1-prod, live getest — zelf-promotie geblokkeerd (42501), naam wijzigen + admin-onboarding werken nog; PR gemerged als `cbf24ab`)* · 🤖 doet het, 🧑 geeft "go"
  - Wat: zonder deze fix kan elke klant-gebruiker zichzelf tot admin promoveren en dan **alle klanten + bezoekers-PII** zien. Nu nog niet misbruikbaar (er zijn geen echte klant-accounts), maar **moet dicht vóór de eerste invite**.
  - Hoe: PR rebasen op main → `npm run migrate:v1` (zet migratie 0026 op V1-prod) → post-migratie-check → merge. Worktree `../chatmanta-v1-lockdown` bestaat al.
- [x] **C2. 🔴 Invite-mail-template** in Supabase V1-prod · 🧑 (🤖 levert de HTML) *(5 okt: Invite + Reset password linken naar `/v1/auth/confirm`; end-to-end getest met C3)*
  - Supabase → V1-prod → Authentication → Emails → **"Invite user"** → link naar `…/v1/auth/confirm?token_hash={{ .TokenHash }}&type=invite`. Zelfde voor **"Reset password"** (`type=recovery`).
- [x] **C3. 🔴 Supabase-mail via Resend (custom SMTP)** · 🧑 + 🤖 *(5 okt: SMTP `smtp.resend.com:465`, afzender `noreply@chatmanta.com`, eigen sending-only API-key. Testinvite via Resend afgeleverd → wachtwoord instellen → klantdashboard: werkt)*
  - Supabase's ingebouwde mailer stuurt maar een paar mails per uur. Bij 3 klanten tegelijk inviten loop je daar tegenaan. Supabase → Auth → SMTP Settings → Resend-gegevens.
- [ ] **C4. 🟡 Leaked-password-protection aan + MFA op je admin-account** · 🧑 (5 min) *(5 okt: leaked-password-protection kan alleen op Supabase **Pro** → aanzetten samen met E7. Admin-MFA: bewust later, niet launch-kritisch)*
  - Supabase → Auth → "Leaked password protection" aan. Daarna 2FA enrollen op je Jorion-admin-account (het admin-dashboard eist daarna automatisch 2FA).
- [x] **C5. 🟡 MX-records op chatmanta.com** · 🧑 (TransIP) *(5 okt: MX → `mx.transip.email` + SPF TransIP, geverifieerd via DNS)*
  - Anders kunnen klanten niet terugmailen naar je afzenderadres. Simpelste: TransIP-mailbox of doorsturen naar je Gmail.
- [x] **C6. 🟡 Monitoring: Sentry + uptime** · 🧑 account, 🤖 zet de DSN — uptime ✅ via Better Stack; Sentry ✅ *(5 okt: org `chatmanta` in EU/Frankfurt, project alleen Error monitoring, IP-opslag uit; `SENTRY_DSN` op Vercel prod + redeploy; testmelding ontvangen en resolved. Sentry is ook als MCP aan Claude Code gekoppeld → "check Sentry" werkt)*
  - Bij 3 klanten tegelijk wil je fouten zien vóórdat een klant belt. Beide gratis.
- [x] ~~**C7. 🟢 (optioneel) Plan 015 sectie G — injectie-regexfix**~~ *(5 okt: vervallen — keuze Sebastiaan: geen extra filter-hulpstappen. Prompt-injectie wordt later afgedekt in de bot-instructies via **plan 013** (context-als-data-grens), bij voorkeur samen met de Luna-overstap. Zie §6.)*

### Fase D — Juridisch & bedrijf (parallel aan C) · 🤝 Niels + 🧑

- [ ] **D1. 🔴 KVK-inschrijving Jorion Solutions** · 🧑/🤝
  - Nodig zodra je gaat factureren (na de gratis eerste maand). Ook handig voor DPA's en zakelijke accounts op bedrijfsnaam. **Advies:** nu regelen — de gratis maand geeft je ±4 weken speling, maar de inschrijving zelf kost ook tijd.
- [ ] **D2. 🔴 DPA's accepteren** bij elke sub-verwerker (DPA = verwerkersovereenkomst: contract dat de leverancier jouw data netjes volgens de AVG behandelt): **OpenAI, Supabase, Vercel, Firecrawl, Upstash, Resend** + **Sentry** (EU-org, sinds 5 okt actief) + **Better Stack** (alleen uptime-pings, geen persoonsgegevens). Meestal een akkoord-knop in het dashboard.
- [ ] **D3. 🔴 Verwerkersovereenkomst mét elke klant** · 🤝
  - Jij verwerkt namens de klant persoonsgegevens van hún websitebezoekers → je hebt er ook één met de klant zelf nodig. 🤖 kan een concept opstellen.
- [ ] **D4. 🔴 Privacyverklaring afmaken** · 👥
  - `/privacy` bestaat al maar is een **scaffold** (stand mei, V0-gericht, met `[BEVESTIG: …]`-gaten en een onvolledige sub-verwerkerslijst). 🤖 werkt hem bij naar V1; jij + Niels lezen na.
- [ ] **D5. 🟢 Pilot-afspraken op papier** · 🤝 — 1 A4: gratis maand, daarna €X/mnd, opzegtermijn, wat de bot wel/niet doet, hoe ze support krijgen.

### Fase E — De 3 klanten klaarzetten · 🤝 Niels (info) + 🧑 (techniek)

- [ ] **E1. Voorzorg "alle 3 tegelijk"** · 🧑
  - Plan de onboarding van alle drie op dezelfde dag, maar zet de widget **pas live** nadat elke bot de Go/No-Go-test (E5) heeft gehaald. Houd de eerste week dagelijks 10 min vrij voor de admin-cockpit (gesprekken, feedback, dag-budget).
- [ ] **E2. Per klant info verzamelen** · 🤝 Niels
  - Website-URL, welke pagina's wel/niet, extra documenten (prijslijst, FAQ, voorwaarden), contactpersoon + e-mail, gewenste toon, **20 testvragen die echte klanten stellen** (+ de verwachte antwoorden).
- [ ] **E3. Per klant omgeving aanmaken** · 🧑 (admindashboard V1 → onboarding)
  - Organisatie + chatbot aanmaken → **`allowed_domains` invullen** (anders mag élke site de widget embedden!) → website crawlen → documenten uploaden → instellingen (toon, contactverzoeken aan/uit).
- [ ] **E4. Invite versturen + inlog testen** · 🧑 — invite → klant zet wachtwoord → komt in klantdashboard.
- [ ] **E5. Go/No-Go per klant** · 👥
  - De 20 testvragen door de bot halen (via preview of `npm run v1:eval` op hun kennisbank). **≥ 16/20 goed én 0 verzonnen feiten** → Go. Anders: kennisbank aanvullen (correctieloop) en opnieuw.
- [ ] **E6. Widget op hun site** · 🧑/klant — snippet uit het klantdashboard plakken → 1 echte chat + 1 testcontactverzoek doen → check dat de mail aankomt.
- [ ] **E0. 🔴 Sleutels roteren vóór de eerste klant-invite** · 🧑 + 🤖 — OpenAI API-key, OpenAI Admin-key en Firecrawl-key zijn op 5 okt per ongeluk in een CC-sessielog beland. Bewust uitgesteld tot vlak vóór launch (keuze Sebastiaan). Volgorde: nieuwe key aanmaken → in `.env.local` → 🤖 zet op Vercel + redeploy + test → pas dán oude key intrekken. Neem `CRON_SECRET`/`EMBED_TOKEN_SECRET` niet mee tenzij nodig (cron-job.org-header moet dan mee).
- [ ] **E7. 🔴 Supabase Pro aanzetten** · 🧑 — ~$25/mnd. **Trigger:** zodra een klant contactverzoeken aanzet op een live site (echte bezoekers-PII) of de eerste betaling binnenkomt. Bij 3 klanten tegelijk live: **zet het aan op launch-dag**. Geeft dagelijkse backups + geen auto-pause.

- [ ] **E8. 🔴 Vercel Hobby → Pro** · 🧑 — ~$20/mnd. **Trigger:** vóór de eerste betaalde factuur (Hobby verbiedt commercieel gebruik). Gratis pilotmaand mag nog op Hobby.

### Fase F — Eerste 30 dagen · 👥

- [ ] **F1. Week 1:** dagelijks admin-cockpit checken (gesprekken, "weet ik niet"-antwoorden, budget, Sentry).
- [ ] **F2. Week 1–2:** ontbrekende kennis aanvullen via de correctieloop; 1 feedback-gesprek per klant (Niels).
- [ ] **F3. Week 4:** evaluatie per klant → van gratis naar betaald (factuur vereist KVK, D1). Beslis daarna wat de eerste V2-feature wordt.
- [ ] **F4. Command Center bijwerken** · 🤖 — de 22 launch-milestones staan nog allemaal op "Niet gestart", terwijl de meeste Sebastiaan-milestones feitelijk af zijn. Laat Claude ze bijwerken zodat Niels de echte stand ziet.

---

## 6. Wat bewust kan wachten (niet nu doen)

- **Plan 013 (prompt-injectie via bot-instructies)** — gekozen route i.p.v. regex-fixes; meenemen in het Luna-traject zodat model + prompt in één betaalde eval gemeten worden.
- **Plannen 012–014** (schema-hardening, prompt-injectie-grens v0.11, migratie-tooling) — goed werk, maar geen launch-blocker.
- **Retentie-cron V1** (90 dagen PII-verwijdering) — route bestaat, wordt pas gepingd zodra AVG serieus wordt (rond V2). *Let op:* met echte bezoekers-PII via contactverzoeken is dit wél verstandig om binnen ~2 maanden na launch aan te zetten.
- **V2-lijst:** Claude Haiku als backup, automatische fallback, hybrid search, meerdere chatbots per klant, EUR-billing, PITR, maandrecap voor V1-klanten.
- **Grote refactors** (god-files `run-rag-query.ts`, `chatmanta-widget.tsx`) — pas na launch.

---

## 7. Beslissingen die nog van jou zijn

| # | Vraag | Mijn advies |
|---|---|---|
| 1 | Dag-budget **€1/dag** per klant (in juli zei je "$1") — houden? | Houden voor de pilot; ruim genoeg voor F&F-volume, en het beschermt je tegen misbruik. |
| 2 | Widget-token-geldigheid **30 min** (jij noemde 1 uur) | Houden — veiliger, gebruiker merkt niets (widget vernieuwt zelf). |
| 3 | Contactverzoeken (lead-capture) per klant aan of uit? | Alleen aan bij klanten die het echt willen — elke "aan" = echte PII = Supabase Pro + retentie relevant. |
| 4 | Prijs na maand 1: €20 of €30? | Laat Niels per klant beslissen; leg het vast in D5. |

---

## 8. Snelreferentie

- **Site:** `https://www.chatmanta.nl` · **V1-login:** `/v1/login` · **Admin:** `/v1/admin` · **Widget-snippet:** `<script src="https://www.chatmanta.nl/widget-v1.js" data-org="<slug>" defer></script>`
- **Vercel-project:** `chatmanta-nosp` · **Supabase V1-prod:** `tfijdnxqdvwzwgxdioqo` · **DNS:** TransIP
- **Detail-checklists:** `docs/V1_LAUNCH_TODO.md` (ops/legal, per stap uitgelegd) · `plans/README.md` (security-plannen) · `docs/AGENT_LANDMIJNEN.md` (valkuilen)
