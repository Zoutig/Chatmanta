# V1 — Launch-TODO (wat JIJ nog moet doen)

> **Belangrijk vooraf:** de **code van V1 is af en getest** (6 PR's gemerged #223–#228, migraties 0007–0009 live, integratie-build groen, antwoordkwaliteit-eval geslaagd). Niets in dit document is een bug of code-werk. Dit zijn **setup-, configuratie- en juridische stappen** om V1 productieklaar te maken voor je eerste echte klant. Veel hiervan kun je in een uurtje afvinken.
>
> **Legenda prioriteit:** 🔴 = moet vóór de eerste ECHTE klant · 🟡 = sterk aanbevolen vóór echt verkeer · 🟢 = optioneel / kan later.
> **Wie:** 🧑 = jij doet dit zelf (account/dashboard/juridisch) · 🤖 = Claude kan dit voor je doen (vraag het me) · 👥 = samen.
>
> **Achtergrond die je vaak nodig hebt:**
> - **Vercel** = waar de site draait. Project heet **`chatmanta-nosp`**, domein **www.chatmanta.nl**. Omgevingsvariabelen (env vars) zet je in *Vercel → Settings → Environment Variables* (kies scope **Production**). **⚠️ Een env-wijziging werkt pas ná een nieuwe deploy** (redeploy).
> - **Supabase** = de database + login. Het **V1-productieproject** heet **"ChatManta V1-prod"** (ref `tfijdnxqdvwzwgxdioqo`). NIET het oude V0-project.
> - **env var / secret** = een instelling/wachtwoord dat de app uitleest maar die niet in de code staat.
>
> **Zie ook:** dit document is de **ops/legal-checklist** voor launch — geen code-werk (zie intro hierboven). Voor de dashboard-/widget-**gaten** die een 5-agent-onderzoek op 2026-07-04 vond (widget-levenscyclus, correctieloop, admin-cockpit, telemetrie-surfacing e.d., bovenop de al gebouwde §1.5-scope) staat het uitvoeringsplan in `docs/DASHBOARD_GAPS_PLAN_2026-07.md` — dat wacht nog op een go van Sebastiaan.

---

## ⭐ Als je niets anders doet, doe dan dit eerst (de 🔴-blockers)
Dit zijn de stappen zonder welke je geen echte klant veilig + werkend kunt aanzetten:
1. **Supabase Pro** (geen auto-pause + dagelijkse backups) — pas écht nodig zodra er onvervangbare data is (eerste betalende klant óf eerste echte bezoeker-PII); zie de trigger in [#9](#9)
2. **Invite-mail-template** in Supabase — [#8](#8)
3. **`IP_HASH_SALT`** op Vercel — [#2](#2)
4. **Firecrawl-key + CRON_SECRET + pinger** (als de klant de website-crawler gebruikt) — [#3](#3), [#4](#4), [#7](#7)
5. **DPA's + privacyverklaring** — [#10](#10), [#11](#11)

De rest (🟡) wil je er kort daarna bij; de 🟢's kunnen wachten.

---

## A. Vercel — omgevingsvariabelen
*(Allemaal: Vercel → `chatmanta-nosp` → Settings → Environment Variables → Production → daarna **Redeploy**. 🤖 Ik kan deze via de Vercel-CLI voor je zetten als je me de waarden geeft of toestemming geeft om de niet-geheime te genereren.)*

### <a name="1"></a>1. 🟡 `SENTRY_DSN` — foutmonitoring aanzetten · 🧑 (account) + 🤖 (zetten)
- **Wat:** Een **DSN** ("Data Source Name") is een URL die de app vertelt waar hij crash-/foutmeldingen naartoe stuurt. Sentry is de dienst die die fouten verzamelt en je een dashboard + alerts geeft.
- **Waarom:** Zonder DSN is de Sentry-bedrading die ik gebouwd heb **inert** (stuurt niks). Mét DSN zie je productie-fouten meteen i.p.v. dat een klant ze als eerste merkt.
- **Hoe:** Maak een gratis account op sentry.io → New Project → platform "Node.js" → kopieer de DSN-URL → zet als `SENTRY_DSN` op Vercel → redeploy.
- **Als je dit overslaat:** de app werkt prima, maar je bent blind voor server-fouten.

### <a name="2"></a>2. 🔴 `IP_HASH_SALT` — bezoekers-IP's veilig pseudonimiseren · 🤖 (ik genereer + zet)
- **Wat:** Een **salt** is een geheime willekeurige tekst die we vóór het hashen aan een IP-adres plakken, zodat het opgeslagen IP niet terug te rekenen is.
- **Waarom (AVG):** De widget logt bezoekers-IP's **gehasht** (nooit als plat IP). Zónder salt is die hash zwak (met een "rainbow table" alsnog te kraken). Mét een geheime salt is het netjes gepseudonimiseerd.
- **Hoe:** Een willekeurige string van 32+ tekens, bv. `openssl rand -hex 32`. Zet als `IP_HASH_SALT` op Vercel → redeploy. 🤖 Ik kan er één genereren en zetten.
- **Als je dit overslaat:** IP's worden nog steeds gehasht (geen lek), maar de pseudonimisering is zwakker dan AVG-netjes — daarom een 🔴 vóór echt bezoekersverkeer.

### <a name="3"></a>3. 🔴* `FIRECRAWL_API_KEY` — de website-crawler laten werken · 🧑 (account)
- **Wat:** De sleutel voor **Firecrawl**, de externe dienst die klant-websites uitleest (crawlt) om de kennisbank te vullen.
- **Waarom:** Zonder deze sleutel kan een klant geen website laten crawlen (een kernfunctie).
- **Hoe:** Account op firecrawl.dev → API-key kopiëren → `FIRECRAWL_API_KEY` op Vercel → redeploy.
- **🔴\*** = blocker *als* je klant de website-crawler gebruikt (dat is de bedoeling). Document-upload werkt ook zonder.

### <a name="4"></a>4. 🔴* `CRON_SECRET` — de crawl-verwerking beveiligen · 🤖 (ik genereer + zet)
- **Wat:** Een geheim wachtwoord dat de crawl-verwerkingsroute (`/api/v1/cron/process-crawls`) beschermt, zodat alleen jouw eigen "pinger" (zie [#7](#7)) hem mag aanroepen — niet een willekeurige bezoeker.
- **Waarom:** Anders kan iedereen de (betaalde) crawl-verwerking triggeren.
- **Hoe:** Willekeurige string → `CRON_SECRET` op Vercel → redeploy. 🤖 Ik genereer + zet hem; je hebt dezelfde waarde nodig in de pinger ([#7](#7)).

### <a name="5"></a>5. 🟡 Upstash (rate-limiting over meerdere servers) · 🧑 (account) + 🤖 (zetten)
- **Wat:** **Upstash** is een gehoste **Redis** (een snelle gedeelde teller-database). De rate-limiter (max-aantal-verzoeken-per-minuut) gebruikt het om te tellen.
- **Waarom:** Vercel draait je app op meerdere "instances" tegelijk. Zonder gedeelde teller telt elke instance los → de limiet is veel slapper. Met Upstash geldt de limiet over álle instances.
- **Hoe:** Account op upstash.com → Redis-database aanmaken → kopieer `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. Zet die + `USE_UPSTASH=true` op Vercel → redeploy. *(V0 gebruikt Upstash al; je kunt dezelfde database delen of een aparte maken.)*
- **Als je dit overslaat:** rate-limiting valt terug op per-instance geheugen — werkt, maar is makkelijker te omzeilen door misbruik.

### <a name="6"></a>6. 🟢 `USD_EUR_RATE` — wisselkoers voor de budget-cap · 🤖
- **Wat:** De budget-cap rekent dollarkosten om naar euro met een vaste koers (default **0.92**).
- **Waarom/Hoe:** Alleen zetten als je een andere koers wilt. Anders niets doen — 0.92 is prima als ruwe backstop.

---

## B. Externe diensten / pingers

### <a name="7"></a>7. 🔴* Externe "pinger" voor de crawl-verwerking · 🧑 (of 🤖 alternatief)
- **Wat:** Een **pinger** is een dienst die op een vast ritme (bv. elke 2 min) automatisch een URL aanroept. De crawler verwerkt wachtende crawl-taken pas als die route wordt aangeroepen.
- **Waarom:** De V1-crawler draait **niet** vanzelf op een Vercel-cron (bewuste keuze, net als V0). Zonder pinger blijven gestarte crawls "hangen" in de wachtrij.
- **Hoe:** Gratis dienst zoals **cron-job.org** of UptimeRobot → maak een job die elke 2–5 min een **GET** doet op `https://www.chatmanta.nl/api/v1/cron/process-crawls` met header `Authorization: Bearer <CRON_SECRET>` (dezelfde waarde als [#4](#4)).
- **🤖 Alternatief:** ik kan in plaats daarvan een **Vercel-cron** toevoegen aan `vercel.json` (kleine code-wijziging) zodat je geen externe dienst nodig hebt — zeg het maar als je dat liever hebt.

### <a name="7b"></a>7b. 🔴 Pingers voor faq-snapshot + retention (na merge PR #242) · 🧑
- **Wat:** Twee extra dagelijkse cron-job.org-jobs voor V1-cron-routes die nergens gescheduled staan.
- **Waarom:** Zonder de faq-snapshot-run blijft de klant-tab "Meest gestelde vragen" permanent leeg; zonder de retention-run draait de beloofde 90-dagen-PII-verwijdering (AVG) niet op V1.
- **Hoe:** cron-job.org → twee dagelijkse jobs, header `Authorization: Bearer <CRON_SECRET>` (zelfde als [#4](#4)), **https+www verplicht** (pinger volgt geen redirects):
  - `GET https://www.chatmanta.nl/api/v1/cron/faq-snapshot`
  - `GET https://www.chatmanta.nl/api/v1/cron/retention` — test eerst handmatig met `?dryRun=1`
- **Env voor de contactverzoek-mail (zelfde PR, werkt pas na redeploy):** `RESEND_API_KEY`; `RESEND_FROM` op **chatmanta.com** (bv. `ChatManta <feedback@chatmanta.com>` — .nl geeft een stil geslikte 403); optioneel `CONTACT_REQUEST_NOTIFY_EMAIL` als globale fallback; `NEXT_PUBLIC_APP_URL` voor de deeplink in de mail.

### <a name="8b"></a>UptimeRobot (uptime-monitoring) — zie 🟢 [#14](#14)

---

## C. Supabase (V1-prod project "ChatManta V1-prod")

### <a name="8"></a>8. 🔴 Invite-mail-template aanpassen · 🧑 (dashboard) + 🤖 (ik lever de template-tekst)
- **Wat:** De e-mail die een nieuwe klant krijgt als jij hem uitnodigt. De **inhoud/knop-link** moet kloppen met onze login-flow.
- **Waarom:** Onze flow gebruikt een **`{{ .TokenHash }}`** die naar `/v1/auth/confirm` wijst. De standaard Supabase-link (`{{ .ConfirmationURL }}`) werkt **niet** met onze opzet → de klant kan dan niet inloggen.
- **Hoe:** Supabase → V1-prod → Authentication → Email Templates → **"Invite user"** → de link/knop laten wijzen naar `…/v1/auth/confirm?token_hash={{ .TokenHash }}&type=invite`. 🤖 Ik kan je de exacte template-HTML aanleveren. Dáárna één keer de invite→login testen.
- **Als je dit overslaat:** klant-onboarding (uitnodigen → inloggen) werkt niet.

### <a name="9"></a>9. 🔴 Supabase Pro — zodra er onvervangbare data is · 🧑
- **Wat:** V1-prod staat nu op de **gratis tier**. **Pro** (~$25/mnd) geeft je twee dingen die free niet heeft: **geen auto-pause** + **dagelijkse backups** (7 dagen herstelbaar).
- **De trigger (lees dit eerst):** met alléén gratis/goedkope testklanten die zelf de bot poken is free-tier prima — er is dan niks onvervangbaars. Upgraden naar Pro is **instant + omkeerbaar** (geen migratie, geen downtime), dus er valt niks vooruit te regelen. Zet Pro aan op de dag dat het eerste van deze twee gebeurt, **wat eerder komt**:
  1. **eerste betalende klant**, óf
  2. **eerste echte bezoeker-PII** — d.w.z. zodra een (test)klant de **contactverzoeken-widget aanzet op een live website** en echte bezoekers naam/e-mail/telefoon achterlaten (`v0_contact_requests`). Dat is een AVG-grens op een DB zonder herstelpad — die toggle staat default-uit, dus dit gebeurt niet per ongeluk.
- **Auto-pause-caveat (de enige free-tier-pijn die ook testklanten raakt):** een free-project pauzeert na **7 dagen stilte** → de bot gaat uit. Mitigatie: de crawl-**pinger** ([#7](#7)) doet elke paar minuten echte DB-queries en houdt het project vanzelf actief. Zet je die toch al op, dan is de pause-zorg gratis weg; anders accepteer je de enkele handmatige unpause (paar minuten).
- **Hoe:** Supabase → V1-prod → Settings → Billing → upgrade naar Pro. Backups staan dan automatisch aan (dagelijks, 7d retentie).
- **Als je dit overslaat ná de trigger:** je riskeert onherstelbaar dataverlies bij echte klant-/bezoekersdata. Vóór de trigger: prima.

### <a name="9-pitr"></a>9-bis. 🟢 PITR (Point-In-Time Recovery) — V2, niet nu · 🧑
- **Wat:** Een **betaalde add-on bóvenop Pro** (apart geprijsd, fors duurder, per uur gefactureerd) waarmee je naar elk moment terug kunt — tot op de seconde — i.p.v. naar de stand van de nacht.
- **Waarom uitstellen:** de dagelijkse backups uit Pro dekken een launch met een handvol klanten ruim. Het verschil ("herstel naar 14:32:07" vs. "herstel naar vannacht") begint pas te knijpen bij veel klanten met veel dagelijkse schrijfacties — een V2-volume-probleem. Niet nu aanzetten.

### <a name="9b"></a>9b. 🟡 MFA (2FA) enrollen op je Jorion-admin-account · 🧑
- **Wat:** **MFA** ("Multi-Factor Authentication", oftewel 2FA) = inloggen met je wachtwoord **én** een code uit een authenticator-app. **AAL2** is het niveau "tweede factor voltooid".
- **Waarom:** Ik heb een **AAL2-check** in het admin-dashboard gebouwd die slim is: hij blokkeert niets zolang je geen MFA hebt (anders zou het admin-dashboard nu al op slot zitten), maar **zodra jij MFA enrollt, eist het admin-dashboard automatisch 2FA**. Dat beschermt het krachtigste account (cross-org toegang).
- **Hoe:** Enroll MFA op je admin-account (authenticator-app). *(Tot die tijd is admin single-factor — bewust, geen lock-out.)*
- **Als je dit overslaat:** je admin-dashboard blijft met alleen wachtwoord beveiligd.

### <a name="9c"></a>9c. 🟡 "Leaked password protection" aanzetten · 🧑
- **Wat:** Een Supabase-Auth-schakelaar die wachtwoorden weigert die in bekende datalekken voorkomen (check tegen HaveIBeenPwned).
- **Waarom:** Voorkomt dat klanten een al-gelekt wachtwoord kiezen. Staat nu uit (security-advisory-waarschuwing).
- **Hoe:** Supabase → V1-prod → Authentication → Policies/Settings → "Leaked password protection" → aan. 30 seconden werk.

---

## D. Juridisch / domein (AVG)

### <a name="10"></a>10. 🔴 DPA's tekenen met je sub-verwerkers · 🧑
- **Wat:** Een **DPA** ("Data Processing Agreement" / verwerkersovereenkomst) is een contract dat zegt dat een leverancier data namens jou verwerkt volgens de AVG.
- **Waarom:** Wettelijk verplicht zodra je echte persoonsgegevens (van klanten + websitebezoekers) verwerkt.
- **Hoe:** Teken/accepteer de DPA bij elke dienst die data ziet: **OpenAI, Supabase, Vercel, Firecrawl, Upstash, Sentry, Resend** (meestal een download/akkoord in hun dashboard onder "Legal/DPA").
- **Als je dit overslaat:** AVG-overtreding bij de eerste echte klant.

### <a name="11"></a>11. 🔴 Privacyverklaring + sub-verwerkers-lijst online · 👥 (ik help met tekst)
- **Wat:** Een publieke pagina die uitlegt welke persoonsgegevens je verwerkt, waarom, en welke sub-verwerkers (de lijst uit [#10](#10)) je gebruikt.
- **Waarom:** AVG-transparantieplicht.
- **Hoe:** Schrijf/laat schrijven en publiceer op de site. 🤖 Ik kan een concept-tekst opstellen op basis van wat V1 daadwerkelijk verwerkt (chat-vragen/antwoorden, gehashte IP's, klant-accounts, gecrawlde website-content).

### <a name="12"></a>12. 🟡 MX-records op chatmanta.com (mail kunnen ontvangen) · 🧑
- **Wat:** **MX-records** zijn DNS-instellingen die zeggen welke mailserver e-mail voor je domein ontvangt.
- **Waarom:** chatmanta.com heeft nu **geen MX** → e-mail naar bv. `niels@chatmanta.com` **bounct stil**. De geverifieerde Resend-afzender is chatmanta.com, dus je wilt hier ook kunnen ontvangen.
- **Hoe:** Bij je DNS-provider (TransIP, ns0.transip.net) MX-records + een mailbox/forwarding instellen.
- **Als je dit overslaat:** binnenkomende mail/notificaties komen nergens aan.

---

## E. Nalopen wat ik autonoom heb gedaan

### <a name="13"></a>13. 🟡 Review de auto-migraties + merges · 🧑 (👥 ik licht toe)
- **Wat:** Ik heb **3 migraties** (0007 telemetrie, 0008 widget `allowed_domains`, 0009 budget) zelf op V1-prod toegepast en **6 PR's** (#223–#228) zelf gemerged naar `main` — met jouw "volledig autonoom"-akkoord.
- **Hoe:** Het volledige logboek (elke migratie + merge + de geflagde keuzes) staat in **`docs/handoffs/V1_COMPLETION_EINDLIJST.md`**. Loop dat door; vraag me alles wat onduidelijk is.
- **Geflagde keuzes om goed te keuren of om te draaien:** dag-budget **€1/dag** (jij zei "$1"), vaste FX **0.92**, widget-token-TTL **30 min** (jij noemde 1u → `EMBED_TOKEN_TTL_SEC=3600`), maand-cap telt **berichten/turns** (geen losse gesprekken).

### <a name="13b"></a>13b. 🟡 Widget testen op een echte testsite · 👥
- **Wat:** Nadat de env hierboven staat: plak de embed-snippet `<script src="https://www.chatmanta.nl/widget-v1.js" data-org="<slug>" defer></script>` op een testpagina en chat.
- **Waarom:** Bewijst de hele keten live (token + allowed-domain + rate-limit + antwoord). Ik heb dit non-billable + lokaal getest (8/8), maar een echte externe site is de laatste check.
- **🤖** Ik kan dit met je meedoen (Playwright/handmatig) zodra de env staat.

---

## F. Optioneel / met de eerste klant (🟢)

### <a name="14"></a>14. 🟢 UptimeRobot-monitor · 🧑
- Een gratis dienst die je site pingt en je waarschuwt als hij down gaat. Nice-to-have ops-monitoring.

### <a name="15"></a>15. 🟢 Eval opnieuw draaien op een ECHTE klant-kennisbank · 🤖
- **Wat:** `npm run v1:eval` draait nu tegen de dunne Manta-demo-corpus (~400 tekens). De antwoordkwaliteit op schaal meet je pas goed op een echte klant-KB.
- **Hoe:** Zodra een klant content heeft geladen, kan ik de fixture op hun KB richten en de eval opnieuw draaien (paar cent).

### <a name="16"></a>16. 🟢 Anti-hallucinatie "negatieve claims" bijslijpen · 🤖
- **Wat:** De eval vond dat de bot soms een *plausibele maar ongefundeerde negatieve bewering* doet ("wij leveren niet aan huis", "op kerstdag gesloten") i.p.v. puur door te verwijzen. Géén verzonnen feiten, géén blocker — een milde softness.
- **Hoe:** Een strengere grounding-gate op negatieve beweringen. Aparte scoped wijziging + her-eval. Advies: doe dit sámen met de eerste echte klant-KB (dan is het meetbaar representatief).

---

## Wat kan ik (Claude) nu meteen voor je doen?
Zeg het woord en ik pak op:
- 🤖 **Secrets genereren + via de Vercel-CLI zetten** (`IP_HASH_SALT`, `CRON_SECRET`) + een redeploy triggeren.
- 🤖 **Upstash/Sentry/Firecrawl-keys zetten** zodra je ze me geeft.
- 🤖 De **Supabase invite-mail-template-tekst** + een **concept-privacyverklaring** opstellen.
- 🤖 Een **Vercel-cron** toevoegen i.p.v. de externe pinger (kleine PR).
- 👥 De **widget op een testsite** testen zodra de env staat.

> De stappen die ik **niet** kan doen, zijn de accounts/dashboards/juridische acties (Sentry/Firecrawl/Upstash-account aanmaken, Supabase Pro-upgrade + PITR + MFA-enroll + toggles, DNS/MX, DPA's tekenen) — die vereisen jouw inlog/handtekening.
