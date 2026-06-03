# v0.10 — HANDOFF (mens, 's ochtends)

> De autonome build kan geen accounts aanmaken of productie-env-vars zetten. Dit zijn
> de stappen die een mens moet doen vóór v0.10 live mag. Per item: **wat**, **waarom**,
> **exacte stap**, **hoe verifiëren**. Tot deze stappen gedaan zijn is v0.10 NIET live-ready.
>
> Volgorde van de ochtend: (1) provisioning hieronder → (2) PR reviewen → (3) mergen →
> (4) deployen. Pas daarna is de Launch-DoD (§2 van de bouwspec) gehaald.

---

## 0. Dragende veiligheidsgrens (HARDE launch-preconditie — geen code)

**Zet NOOIT echte klantdata in een demo-bereikbare sandbox-org.** Het publieke embed-pad
is veilig (per-org HMAC embed-token gebonden aan de URL-slug — cookie/`?org=`-switch faalt
met 401). MAAR de cookie-authed demo/admin-surface (`V0_DEMO_PASSWORD`-sandbox) laat vrij
org-switchen. Dit is de dragende veiligheidsgrens voor testklanten, niet C10. Leg dit vast
als expliciete afspraak met de testklanten: hun echte data gaat pas in V1 (Supabase Auth +
`organization_members` membership-check), niet in een V0-sandbox-org.

---

## 1. CI-build secrets (C1) — `[repo-secrets]`

- **Wat:** de nieuwe GitHub Actions workflow `.github/workflows/build.yml` draait op elke PR
  `npm ci` → `tsc` → `next build`.
- **Waarom:** `next build` draait `generateStaticParams` voor de SSG-widget-pagina's, die
  Supabase queryt. Zonder build-time DB-env faalt die stap.
- **Exacte stap:** GitHub → repo → Settings → Secrets and variables → Actions → New
  repository secret, zet:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  (de keys van het **V0-sandbox**-Supabase-project — alleen fake demo-data.)
- **Hoe verifiëren:** open een PR → de `build`-check wordt groen.

---

## 2. Vercel prod-env-vars (C2/C3/C6/C8) — `[prod-env]`

Zet in Vercel → project `chatmanta-nosp` → Settings → Environment Variables (Production),
daarna **Redeploy** (env-wijzigingen worden pas na redeploy actief):

| Var | Waarom | Verifiëren |
|-----|--------|-----------|
| `EMBED_TOKEN_SECRET` (≥16 chars, random) | Fail-closed embed-token. **Zonder deze → startup-assert (C2) crasht de boot luid.** Genereer zelf, zet NIET in de repo. | Boot-log toont geen assert-fout; widget laadt. |
| `CRON_SECRET` (random) | Beschermt de retentie-cron-route (C8). | `GET /api/cron/retention` zonder header → 401; Vercel-cron (met header) → 200. |
| `USE_UPSTASH=true` | Zet de rate-limit op de gedeelde Upstash-store i.p.v. in-memory (C6). | Zie Upstash hieronder. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Upstash-credentials. **Met `USE_UPSTASH=true` maar zonder deze → startup-assert (C2) crasht luid** (geen stille in-memory fallback). | Boot-log schoon; rate-limit telt over instances. |
| `OPENAI_ADMIN_KEY` (optioneel) | Usage/cost-rapportage; graceful fallback bestaat. | Admin-dashboard cost-cijfers. |
| `FIRECRAWL_API_KEY` | Live website-crawl. | Crawl in de Kennisbank. |

Genereer secrets met bv. `openssl rand -hex 32` (of `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). **Genereer ze NIET in de repo en commit ze nooit.**

---

## 3. Upstash provisioneren (C6) — `[account + prod-env]`

- **Wat:** een Upstash Redis-DB voor de gedeelde rate-limit-store.
- **Waarom:** de in-memory rate-limit telt niet over serverless-instances; onder load lekt
  hij. De code is klaar (`lib/v0/server/rate-limit.ts`); alleen live-zetten is handwerk.
- **Exacte stap:** upstash.com → account → Create Database → Redis → regio **EU (Frankfurt)**
  → kopieer de REST URL + REST TOKEN → zet ze + `USE_UPSTASH=true` in Vercel prod (zie §2) →
  Redeploy.
- **Hoe verifiëren:** na redeploy een paar snelle widget-requests boven de limiet → HTTP 429
  / `RATE_LIMIT`; de teller blijft consistent over herhaalde requests (niet per-instance).

---

## 4. UptimeRobot (ops) — `[account]`

- **Wat:** een gratis uptime-monitor op de widget-ping.
- **Waarom:** v0.10 heeft GEEN push-alerting (zie §6 known limitation) — een externe ping is
  de minimale dekking dat de publieke widget leeft.
- **Exacte stap:** uptimerobot.com → Add New Monitor → HTTP(s) → URL
  `https://www.chatmanta.nl/api/v0/widget/ping` → interval 5 min → alert-contact = e-mail.
- **Hoe verifiëren:** monitor toont "Up"; test de alert door de URL tijdelijk te wijzigen.

---

## 5. DPA + sub-processors (juridisch) — `[document]`

- **Wat:** een getekende verwerkersovereenkomst (DPA) + sub-processor-lijst.
- **Waarom:** AVG — er stroomt echte bezoeker-data door de widget.
- **Exacte stap:** laat het concept-DPA + sub-processor-lijst (OpenAI, Supabase, Vercel,
  Firecrawl, Upstash, Resend) juridisch toetsen en tekenen. (De agent levert hooguit een
  concept; dit is geen code.)
- **Hoe verifiëren:** getekend document in het bedrijfsdossier.

---

## 6. Known limitation — GEEN push-alerting (post-launch #1)

v0.10 heeft **geen** push-alert als de bot fouten spuwt of geld verbrandt — alleen de in-app
Issues-tab + de UptimeRobot-ping. **Launch-preconditie:** tot er een alert is (bv. een
Resend-mail bij budget-cap-hit + error-rate-spike), moet de operator het admin-dashboard
handmatig monitoren. Dit is een bewuste scope-keuze (niet in v0.10 gebouwd) en het #1
post-launch-ops-item.

---

## Provisioning-checklist (afvinken 's ochtends)
- [ ] §1 CI repo-secrets gezet → PR-build groen
- [ ] §2 Vercel prod-env-vars gezet + geredeployd
- [ ] §3 Upstash live (EU) + `USE_UPSTASH=true`
- [ ] §4 UptimeRobot-monitor + alert
- [ ] §5 DPA getekend
- [ ] §0 testklant-afspraak: geen echte data in sandbox-orgs
- [ ] PR gereviewd, gemerged, gedeployed
