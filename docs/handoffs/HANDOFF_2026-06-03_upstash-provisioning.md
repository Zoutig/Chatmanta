# Handoff — Upstash rate-limit provisioneren (v0.10 launch) — 2026-06-03

## ⚡ Resume in 30 seconds
> Plak in een verse sessie (vanuit welke ChatManta-map dan ook):
> **"Lees `docs/handoffs/HANDOFF_2026-06-03_upstash-provisioning.md` en help me Upstash live te zetten volgens de stappen. Ik doe de account-/Vercel-handelingen zelf; jij verifieert en denkt mee."**

- **Doel:** de gedeelde Upstash Redis rate-limit-store live zetten voor v0.10, zodat rate-limiting consistent telt over alle serverless-instances (i.p.v. de in-memory fallback die onder load lekt).
- **Status:** code is klaar (`lib/v0/server/rate-limit.ts`); dit is puur provisioning-handwerk (account + 3 env-vars + redeploy). **Geen code-werk.**
- **Blocker-status:** GEEN launch-blocker. v0.10 draait zonder Upstash op de in-memory fallback. Dit is "alvast netjes maken", aanbevolen maar uitstelbaar.

## 🎯 Waarom dit bestaat
v0.10 voegde een per-IP + per-org rate-limit toe (tegen misbruik/kosten). Zonder Upstash valt die terug op een geheugen-teller **per server-instance** — op Vercel draaien meerdere instances, dus de teller lekt onder load en de limiet werkt niet betrouwbaar. Upstash is een gedeelde Redis-store waar alle instances naar dezelfde teller schrijven.

## ⚠️ DE ÉNE GOTCHA (lees dit eerst)
v0.10 heeft een **fail-closed startup-assert**: zet je `USE_UPSTASH=true` **zonder** de bijbehorende URL + token, dan **crasht de server bij het opstarten** (bewust — geen stille fallback). Daarom:
> **Zet alle drie de vars TEGELIJK, of geen van drie.** Nooit `USE_UPSTASH=true` los.

## ▶️ Stappen (mens doet de handelingen, agent verifieert/denkt mee)
1. **Upstash-account + database**
   - Ga naar [upstash.com](https://upstash.com) → log in / maak account.
   - **Create Database → Redis** → regio **EU (Frankfurt)** (zelfde continent als Supabase/Vercel = lage latency + data binnen de EER).
   - Open de database → kopieer **`UPSTASH_REDIS_REST_URL`** en **`UPSTASH_REDIS_REST_TOKEN`** (de REST-variant, niet de TCP-connection-string).

2. **Drie env-vars in Vercel** (project `chatmanta-nosp` → Settings → Environment Variables, scope **Production**):
   - `UPSTASH_REDIS_REST_URL` = (de REST URL)
   - `UPSTASH_REDIS_REST_TOKEN` = (de REST token)
   - `USE_UPSTASH` = `true`

3. **Redeploy** (env-wijzigingen worden pas ná een redeploy actief): Vercel → Deployments → laatste → Redeploy. **Of** wacht tot de eerstvolgende `git push origin main`.

4. **Verifiëren**
   - **Boot schoon?** Vercel → laatste deployment → Function/Build-logs: géén startup-assert-fout. (Crasht 'ie wél → een van de 3 vars klopt niet of `USE_UPSTASH=true` staat los.)
   - **Rate-limit telt gedeeld?** Doe een paar snelle widget-requests boven de limiet → je krijgt HTTP **429 / `RATE_LIMIT`**, en de teller blijft consistent over herhaalde requests (niet per-instance opnieuw).

## ✅ Klaar wanneer
- [ ] Upstash Redis-DB in EU (Frankfurt) bestaat
- [ ] 3 vars in Vercel Production gezet
- [ ] Geredeployd
- [ ] Boot-log schoon (geen assert-fout)
- [ ] 429 verschijnt bij over-limiet requests

## 📎 Context pointers
- Code: `lib/v0/server/rate-limit.ts` · startup-assert: `instrumentation.ts` + `lib/v0/server/startup-assert.ts`
- Bron-stappen (op de v0.10-branch `feat/seb/v0-10-autonoom`, ná merge ook op main): `HANDOFF.md` §3 + `DEPLOY.md` (sectie "v0.10 — extra prod-env-vars")
- Lokale tip: in `.env.local` staan `UPSTASH_REDIS_REST_URL`/`_TOKEN` nu uitgecommentarieerd — lokaal hoeft Upstash niet (in-memory is daar prima).
- Gerelateerd: de overige launch-stappen (UptimeRobot, DPA) staan in `HANDOFF.md` op de v0.10-branch.
