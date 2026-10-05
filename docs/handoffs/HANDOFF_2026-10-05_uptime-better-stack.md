# Handoff — UptimeRobot vervangen door Better Stack — 2026-10-05

## ⚡ Resume in 30 seconds
> Plak dit in een nieuwe sessie, vanuit `C:\Users\solys\Documents\Code\chatmanta`:
> **"Lees `docs/handoffs/HANDOFF_2026-10-05_uptime-better-stack.md` en vervang UptimeRobot door Better Stack. Loods me stap voor stap."**

- **Branch:** main (er is nog niets gebouwd; voor de docs-update hieronder een nieuwe branch maken)
- **State:** alleen het besluit is genomen. Er is nog geen account, monitor of docs-wijziging.
- **NEXT ACTION:** Stap 0: vraag Sebastiaan of er al een UptimeRobot-account met monitors bestaat. Begeleid hem daarna bij stap 1 (Better Stack-account).

## 🎯 Goal
Uptime-monitoring voor ChatManta opzetten op **Better Stack** in plaats van UptimeRobot. Uptime-monitoring betekent: een dienst die elke paar minuten je site opvraagt en je mailt als hij plat ligt.

**Waarom:** het gratis plan van UptimeRobot mag alleen voor hobby- en non-profitgebruik. Accounts die er commercieel uitzien moeten upgraden. Het gratis plan van Better Stack mag wél commercieel gebruikt worden. Dat plan geeft 10 monitors, 10 heartbeats, 1 statuspagina en een check elke 3 minuten.

Bron: de tool-review van 2026-10-05 (alle externe diensten vergeleken met alternatieven). Dit was daar actiepunt 2.

## ✅ Done
- Besluit genomen: Better Stack, gratis plan. Nog niet gecommit, alleen dit document.
- Live URL's alvast gecontroleerd (2026-10-05, met curl):
  - `https://www.chatmanta.nl/v1/login` → **200** (~1,3 s)
  - `https://www.chatmanta.nl/widget-v1.js` → **200** (het V1-widgetscript dat klanten insluiten)
  - `https://www.chatmanta.nl/widget.js` → **200** (V0-widgetscript)
  - `https://www.chatmanta.nl/` → **307**, een redirect naar `/login?next=%2F`. **Niet** als monitor-URL gebruiken: kies de concrete pagina, dan test je wat er echt toe doet.

## 🚧 Where I left off (the live thread)
- Er is nog geen werk gestart. Volgens `docs/V1_LAUNCH_TODO.md` #14 en `docs/V1_STATUS_EN_PLAN.md` (rij "11 — Sentry + UptimeRobot ❌ niet-gestart") is UptimeRobot **waarschijnlijk nooit opgezet**. In de praktijk wordt het dus "Better Stack nieuw opzetten" plus "docs bijwerken". Bevestig dit met Sebastiaan (stap 0).

## ▶️ Next steps (ordered) — stap voor stap voor Sebastiaan

De agent kan geen accounts aanmaken of in dashboards klikken. Sebastiaan doet de 🧑-stappen, de agent begeleidt en controleert.

**Stap 0 — 🧑 Bestaat er al iets bij UptimeRobot?**
Ja: noteer welke URL's er gemonitord worden en neem die mee naar stap 2. Verwijder het UptimeRobot-account pas in stap 6, als Better Stack werkt. Nee: door naar stap 1.

**Stap 1 — 🧑 Account aanmaken**
1. Ga naar https://betterstack.com/uptime → "Sign up" → kies het **Free**-plan (geen creditcard nodig).
2. Gebruik je zakelijke mailadres als je dat hebt, anders `s.olyslag@gmail.com`.

**Stap 2 — 🧑 Monitors aanmaken** (Uptime → Monitors → "Create monitor")

| # | URL | Type ("Alert us when") | Waarom |
|---|---|---|---|
| A | `https://www.chatmanta.nl/v1/login` | "URL becomes unavailable" | Draait de app (Next.js-server + V1-routes)? |
| B | `https://www.chatmanta.nl/widget-v1.js` | "URL becomes unavailable" | Kan de chatbot op klantsites laden? Dit is het belangrijkste voor klanten. |
| C *(optioneel)* | `https://www.chatmanta.nl/widget.js` | "URL becomes unavailable" | V0-widget. Alleen zolang V0-demo's extern ingesloten zijn. |

Instellingen per monitor (onder "Advanced settings"):
- **Check frequency:** 3 minuten. Dat is het minimum op het gratis plan.
- **Request timeout:** 30 seconden. Vercel-functies hebben soms een "cold start" (opstarttijd na een rustige periode), en een te korte timeout geeft dan vals alarm.
- **Confirmation period / "recovery"**: zet die op ~2–3 minuten, zodat één haperende check nog geen alarm geeft.
- **Regions:** standaard laten staan, of Europa aanvinken als dat kan.

**Stap 3 — 🧑 Meldingen instellen**
- Uptime → "On-call" / "Escalation policy": e-mail naar Sebastiaan. Optioneel: installeer de Better Stack-app op je telefoon voor pushmeldingen.
- Sms en telefoon zijn op het gratis plan beperkt of niet beschikbaar. E-mail plus push is genoeg.

**Stap 4 — 🧑+🤖 Testen of een alarm echt aankomt**
- Maak tijdelijk een monitor D op een URL die gegarandeerd faalt, bijvoorbeeld `https://www.chatmanta.nl/dit-bestaat-niet-uptime-test` (geeft 404).
- Wacht ~5 minuten en controleer of de alarmmail binnenkomt. Verwijder monitor D daarna.
- 🤖 De agent kan meekijken door de URL's met `curl -s -o /dev/null -w '%{http_code}'` te controleren.

**Stap 5 — 🧑 (optioneel) Statuspagina**
- Het gratis plan heeft 1 statuspagina. Die is nu **niet nodig**; zinvol zodra er betalende klanten zijn (bv. `status.chatmanta.nl` via een DNS-CNAME). Overslaan is prima.

**Stap 6 — 🧑 UptimeRobot opruimen** (alleen als stap 0 "ja" was)
- Pauzeer de monitors, wacht een dag, en verwijder daarna het account.

**Stap 7 — 🤖 Docs bijwerken** (kleine docs-PR op een feature-branch, nooit direct op main)
- `git checkout -b feat/seb/better-stack-uptime-docs`
- `docs/V1_LAUNCH_TODO.md`: anker `8b` en sectie **#14** hernoemen naar Better Stack, inclusief de monitor-URL's en de reden (UptimeRobot gratis = non-commercieel). Vink af wat gedaan is.
- `docs/V1_STATUS_EN_PLAN.md`: regel 68 ("11 — Sentry + UptimeRobot") en regel 113 aanpassen.
- `AGENTS.md`, Stack-sectie V1: "Sentry, UptimeRobot, Upstash Ratelimit, Resend" → "Sentry, Better Stack (uptime), …".
- In `docs/V1_LAUNCH_TODO.md` #7 wordt UptimeRobot genoemd als mogelijke pinger. Vervang dat door cron-job.org alleen.
- Daarna: PR maken met de template. Docs-only, dus vraag Sebastiaan of direct mergen oké is.

**Stap 8 — 🤖 Memory bijwerken**
- Werk `tooling_review_2026_10.md` in de CC-memory bij: punt 2 (Better Stack) → AF, met de datum.

## 🧠 Decisions & rationale
- **Better Stack** — commercieel gebruik mag gratis, en 10 monitors is ruim genoeg. **Afgewezen:** UptimeRobot (gratis = non-commercieel); Pulsetic (prima, maar minder bekend en geen extra voordeel); betaalde plannen (nu niet nodig).
- **Monitor `/v1/login` en `widget-v1.js`, niet de homepage**: de homepage is een 307-redirect naar de V0-login. Daarmee test je de verkeerde laag.
- **Cron-endpoints (`/api/v1/cron/*`) NIET als uptime-monitor gebruiken**: zonder `CRON_SECRET` geven ze 401 (vals alarm). Mét het secret zou elke check (elke 3 min) echt werk starten (crawls, FAQ-snapshot). Daarnaast komt er dan een geheim in een externe dienst te staan.
- **Geen Better Stack-heartbeats voor de cron-job.org-jobs (nu)**: daarvoor moeten de cron-routes zelf een heartbeat-URL aanroepen, dus een codewijziging. Simpeler alternatief: zet in cron-job.org bij elke job **"Notify on failure"** aan (e-mail). Heartbeats eventueel later.

## ⚠️ Dead-ends & gotchas (don't repeat)
- `https://www.chatmanta.nl/v1/widget.js` geeft **404**. Het V1-script staat op `/widget-v1.js` (`public/widget-v1.js`).
- De `<title>` van `/v1/login` is (nog) "ChatManta V0". Een keyword-monitor op "V1" faalt dus. Gebruik geen keyword-check, of gebruik keyword "ChatManta".
- cron-job.org volgt geen redirects. Dat is niet relevant voor Better Stack, maar gebruik ook daar consequent `https://www.`-URL's.

## ❓ Open questions / waiting on Sebastiaan
- Bestaat er al een UptimeRobot-account (stap 0)?
- Welk mailadres moet de alarmen krijgen?
- Wil je nu al een statuspagina, of pas bij betalende klanten? (Advies: later.)

## 🗂️ Git & environment snapshot
- Behind origin/main: 0 commits (2026-10-05)
- Uncommitted: alleen dit handoff-bestand (niet gecommit)
- Local-only (unpushed) commits: geen
- Open PRs: #255 (herstart-draaiboek), #207 (devcontainer). Geen van beide raakt dit.
- Background tasks still running: geen
- Dev server: niet nodig voor deze taak

## 🔌 Get back to a working state
```powershell
cd C:\Users\solys\Documents\Code\chatmanta
git fetch origin; git status
# Geen dev-server nodig. Voor de docs-PR: git checkout -b feat/seb/better-stack-uptime-docs
```

## 📎 Context pointers
- Memory: [[tooling-review-2026-10]] · [[v1-launch-ops-progress]] · MEMORY.md
- Docs: `docs/V1_LAUNCH_TODO.md` (#7, 8b, #14) · `docs/V1_STATUS_EN_PLAN.md:68,113` · `AGENTS.md` (Stack → V1)
- Better Stack free plan: https://betterstack.com/uptime ("10 monitors, 10 heartbeats and a status page with 3-minute checks totally free")
