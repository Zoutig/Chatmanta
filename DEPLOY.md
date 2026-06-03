# Deploy ChatManta V0 naar Vercel

V0 demo-deploy. Voorwaarde: lokale dev draait + alle migrations zijn toegepast op Supabase.

## Eénmalig: project linken

**Snelste pad — via Vercel dashboard:**

1. Ga naar [vercel.com/new](https://vercel.com/new)
2. **Import Git Repository** → kies `Zoutig/Chatmanta`
3. **Framework preset**: Vercel detecteert Next.js automatisch — laat staan
4. **Build settings**: niets veranderen
5. **Environment Variables**: kopieer onderstaande lijst (zie sectie hieronder)
6. Klik **Deploy**

Vanaf nu: elke `git push origin main` triggert auto-deploy.

## Environment Variables die je in Vercel moet zetten

Settings → Environment Variables. Zet alles op **Production, Preview, Development** tenzij anders aangegeven.

| Variable | Waarde | Waarom |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | jouw Supabase project URL | Browser + server gebruiken dit |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | jouw anon JWT | Browser auth (alhoewel V0 dit niet gebruikt) |
| `SUPABASE_SERVICE_ROLE_KEY` | jouw service-role JWT | Server-only — NIET als NEXT_PUBLIC_ |
| `NEXT_PUBLIC_PRODUCT_NAME` | `ChatManta` | UI-text |
| `NEXT_PUBLIC_APP_URL` | de Vercel deploy-URL (bv. `https://chatmanta.vercel.app`) | Voor links naar zichzelf |
| `OPENAI_API_KEY` | jouw OpenAI key (geroteerd!) | LLM + embeddings |
| `V0_DEMO_PASSWORD` | het wachtwoord dat bezoekers intikken | Auth-gate |
| `V0_COOKIE_SECRET` | 32+ random chars, genereer via `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` | Cookie-signing |

**Niet nodig op Vercel** (alleen lokaal voor scripts):
- `DATABASE_URL` — alleen voor `npm run migrate` lokaal
- `ANTHROPIC_API_KEY` — niet gebruikt in V0

## Post-deploy verificatie

1. Open de Vercel URL → moet redirecten naar `/login`
2. Log in met `V0_DEMO_PASSWORD`
3. Stel een vraag → antwoord moet streamen
4. Check de Function logs in Vercel dashboard voor je eerste vraag — moet ~3-10s duren afhankelijk van versie

## Browser/viewport — desktop-only voor V0

V0 is **desktop-first ontworpen, ≥880px aanbevolen**. Onder die breedte
worden de sidebar (threads + nieuwe-vraag) en het rechter paneel (bronnen,
documenten, instellingen, widget-preview) verborgen via één enkele
@media-rule in `app/globals.css`. De chat blijft dan technisch werken,
maar zonder die panelen kun je geen nieuwe gesprekken starten, geen oude
gesprekken openen, geen documenten uploaden en geen bronnen bekijken.

Bewuste keuze: V0 is intern + 2-3 testklanten op laptop. Echte responsive
mobile UX hoort bij V1 (Fase 6 widget-laag) wanneer er een publiek-facing
oppervlak komt.

Geadviseerd: open V0 op laptop/desktop, ≥880px viewport.

## Veelvoorkomende deploy-issues

- **"FUNCTION_INVOCATION_TIMEOUT"** → max-duration is op 60s gezet, mocht v0.3 toch langer doen: upgrade naar Pro of zet versie defaults op v0.1
- **Supabase RLS errors in functions** → server gebruikt service-role key, controleer `SUPABASE_SERVICE_ROLE_KEY` is gezet en NIET de anon key
- **"OPENAI_API_KEY missing"** in functie-logs → env var niet gezet voor Production scope

## Nieuwe migration na deploy?

Migrations runnen we **lokaal** met `npm run migrate` — Vercel raakt de database niet aan. Workflow:

1. Schrijf nieuwe migratie in `supabase/migrations/000N_*.sql`
2. `npm run migrate` op je dev-machine — past toe op productie-DB
3. Push code → Vercel deploy gebruikt het verse schema

Voor V1 met meer teamleden: overweeg een dedicated CI-stap voor migrations, of Supabase CLI met dev/prod environments.

---

## v0.10 — extra prod-env-vars (productie-hardening)

v0.10 voegt een kosten-/misbruik-cap, een AVG-codelaag en observability-haken toe. Zet
deze env-vars in Vercel (Production) **en redeploy** (env-wijzigingen worden pas na een
redeploy actief). Genereer secrets lokaal (`openssl rand -hex 32` of
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`) en
commit ze NOOIT.

| Variable | Verplicht? | Waarom | Default als leeg |
|---|---|---|---|
| `EMBED_TOKEN_SECRET` | **JA (≥16 chars)** | HMAC embed-token (fail-closed). | **Boot crasht luid** via de startup-assert (C2) — bewust, anders gaat de hele publieke widget stil 401-zwart. |
| `CRON_SECRET` | JA (voor retentie) | Beschermt `/api/cron/retention` (C8). | Cron-route weigert alles (401) → retentie draait niet. |
| `USE_UPSTASH` | aanbevolen (`true`) | Gedeelde rate-limit-store i.p.v. in-memory (C6). | In-memory fallback (telt niet over instances). |
| `UPSTASH_REDIS_REST_URL` | als `USE_UPSTASH=true` | Upstash REST endpoint. | **Boot crasht luid** via de startup-assert (C2) bij `USE_UPSTASH=true` zonder deze vars — geen stille fallback. |
| `UPSTASH_REDIS_REST_TOKEN` | als `USE_UPSTASH=true` | Upstash REST token. | idem. |
| `CHATMANTA_DAILY_BUDGET_USD` | optioneel | Per-dag-per-org LLM-kostencap in USD (C3). | const-default (zie `lib/v0/server/budget.ts`). |
| `OPENAI_ADMIN_KEY` | optioneel | Usage/cost-rapportage; graceful fallback. | Cost-rapport valt terug op schatting. |
| `FIRECRAWL_API_KEY` | optioneel | Live website-crawl. | Crawl uitgeschakeld. |

### Startup-assert (C2 — fail-closed boot-check)
`instrumentation.ts` draait bij server-boot (`register()`, alleen `NEXT_RUNTIME==='nodejs'`)
een assert:
- **`EMBED_TOKEN_SECRET` ontbreekt of < 16 chars → harde fout, boot stopt.** Zonder deze
  assert faalt `verifyEmbedToken` STIL (geeft `false` zonder log) en gaat de hele publieke
  widget 401-zwart zonder signaal. Daarom luid falen.
- **`USE_UPSTASH=true` maar Upstash-URL/token ontbreekt → harde fout.** Voorkomt dat
  productie stil terugvalt op de in-memory rate-limit (die niet over instances telt).

Op een lokale dev-machine met volledige `.env.local` zijn beide groen. Mist er een var op
prod, dan zie je het direct in de Vercel function-/build-logs (boot-fout), niet pas als de
widget bij een bezoeker faalt.
