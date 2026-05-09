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
