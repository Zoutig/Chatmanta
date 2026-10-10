# Marketing-site chatmanta.nl — implementatieplan (milestones)

**Spec:** `docs/superpowers/specs/2026-10-10-marketing-site-design.md` · **Datum:** 2026-10-10
**Visuele bron-van-waarheid:** `mockup-final.html` + `COPY.md` (na goedkeuring gekopieerd naar `docs/site/`)

## Beslissingen na het ontwerp-toernooi (2026-10-10, Sebastiaan akkoord)

- Richting: **A "Diepzee Licht"** als basis + grafts: C's cut-out-heropaneel, grotere Jakarta-800-koppen, monospace sectielabels; B's teal-glow op Groei, donkere nacht-sectie voor "Liever eerlijk dan verzonnen", prijzen in statische HTML.
- Badge Groei = **"Aanbevolen"** (niet "Meest gekozen" — zonder klanten een verzonnen claim). Wijzigt spec §6.
- Vertrouwensstrook = **"Opgeslagen in Europa · Verwerkersovereenkomst beschikbaar · Volledig Nederlands · Antwoordt alleen uit jouw content"** (LLM-calls gaan naar OpenAI-VS; "AVG-proof/Data in Europa" pas na OpenAI-EU + DPA). Wijzigt spec §5.3.
- ROI-rekenhulp met zichtbare aanname **±50% zelf afgehandeld**.
- Beloftes "binnen een werkdag live" en "reactie binnen 1 werkdag" bevestigd.
- Doorgestreepte prijs altijd gelabeld "normaal, na de eerste 25 klanten"; dagframing per toggle-stand.
- Compleet-pagina's: "Hele site — op maat, in overleg" (tot crawl-cap-taak klaar is).

## Milestones

### M1 — V0 verhuist naar `/v0/*` + proxy `[independent]` · eigen branch `feat/seb/v0-naar-v0-pad` · PR 1
- Verplaats pagina-routes `home`, `login`, `admindashboard`, `klantendashboard`, `admintool`, `commandcenter`, `widget` (demo-pagina) naar `app/v0/<route>`.
- **Let op gedeelde modules:** `app/widget/components/*` en `app/widget/org-skins.ts` worden door `/embed/[slug]` geïmporteerd → alleen de pagina's verhuizen, of de modules mee verhuizen mét import-updates; `/embed` blijft functioneel identiek. Idem `app/components`, `app/actions`, `app/styles` (gedeeld, niet route-gebonden) — blijven staan.
- Permanente redirects (308) oud → nieuw in `next.config.ts` `redirects()` (incl. `/:path*` en querystring).
- Alle ~65 bestanden met hardcoded paden bijwerken (links, `redirect()`, `next=`-param, `revalidatePath`, tests, `tests/global-setup.ts`).
- `proxy.ts`: login-redirect wordt `/v0/login`; matcher-uitzondering `login` → `v0/login`. Deny-by-default blijft.
- `app/page.tsx`: tijdelijk redirect naar `/v0/home` (M2 vervangt hem door de site).
- **Acceptatie:** typecheck + build groen; Playwright: oude URL's redirecten, V0-login → hub werkt, `/embed/<slug>` + `/widget.js` + `/api/v0/chat` ongewijzigd bereikbaar zonder cookie; V1 (`/v1/login`) en `/voorbeeld` ongewijzigd.

### M2 — Site-fundament `[depends-on: M1]` · branch `feat/seb/marketing-site` · PR 2
- `app/(site)/layout.tsx` + `app/(site)/site.css` (tokens `.site-ui` uit mockup-final, los van `globals.css`), fonts (Jakarta 400-800 + mono), `app/(site)/page.tsx` vervangt `app/page.tsx`.
- Gedeelde primitives: `Section` (label + scroll-margin), `Button`, `Reveal` (motion, reduced-motion-aware), nav (sticky/compact/scroll-progress/active-indicator, mobiele sheet), footer.
- `lib/site/pricing.ts`: tiers, prijzen (normaal/intro × maand/jaar), limieten, features, support, `showSpotsCounter: false`, `kvk: null`, contact. Unit-test op afgeleide waarden (dagframing, jaartotaal).
- `proxy.ts`: open voor `^/$`, `kennismaking(?:/|$)`, `voorwaarden(?:/|$)`, `api/site(?:/|$)`, `sitemap.xml`, `robots.txt`, OG-image-pad.
- SEO: `metadata`, `sitemap.ts`, `robots.ts`, OG-image (let op metadata-route-filename-collisies — verifiëren met echte build).
- **Acceptatie:** lege secties met nav/footer renderen op `/` zonder demo-cookie; V0-pagina's nog steeds achter de gate; typecheck + build + pricing-test groen.

### M3 — Secties `[depends-on: M2]` — 4 parallelle werkpakketten (elk eigen componentmap, geen gedeelde bestanden behalve `page.tsx`, die de orchestrator samenstelt)
- **M3a** Hero (cut-out + zelftypende chat met bronlink, SSR-tekst) · vertrouwensstrook · probleem (inbox-teller).
- **M3b** Hoe het werkt (scroll-gestuurd, crawl-animatie, snippet) · functies-bento · "Liever eerlijk dan verzonnen" (nacht-sectie).
- **M3c** Dashboard-showcase · ROI-rekenhulp · prijzen (leest `lib/site/pricing.ts`, statische SSR-bedragen, toggle default jaarlijks, vergelijkingstabel).
- **M3d** Live-demo-blok · FAQ (accordion, FAQPage-JSON-LD) · slot-CTA · `/voorwaarden`-placeholder.
- **Acceptatie per pakket:** matcht mockup-final op 1440 + 390; reduced-motion-variant; geen horizontale scroll; geen console-errors.

### M4 — Kennismaking `[depends-on: M2]` (parallel met M3)
- `app/(site)/kennismaking/page.tsx` + formulier (velden spec §7, `?pakket=` voorselectie, toestemmingsvinkje → `/privacy`).
- `app/api/site/kennismaking/route.ts`: zod-validatie, honeypot, per-IP rate-limit (bestaande Upstash-helper), Resend via `lib/notifications/email.ts` → `info@chatmanta.com` + bevestiging aanvrager; geen DB; geen PII in logs; nette fout met mailadres-fallback.
- **Acceptatie:** unit-tests validatie/honeypot/rate-limit; Playwright happy path met gemockte Resend; echte testmail één keer handmatig (na akkoord).

### M5 — Kwaliteit `[depends-on: M3, M4]`
- Lighthouse mobiel ≥ 90 ×4, axe zonder serious/critical, reduced-motion-check, 375/768/1440 screenshots, CTA-paden klikken.
- Daarna big-ship 5a-review-loop (code-review ⇄ Codex, ≤3 rondes) + 5b clean build + 5c browser-verify → PR 2 → ultra-gate (Seb) → merge.

### M6 — Dogfooding-chatbot `[depends-on: M5 gemerged]` · PR 3 (later)
- V1-org "ChatManta" met kennisbank-content (Seb keurt goed), origin-allowlist `chatmanta.nl`, widget-embed in site-layout.

## Uitvoering
- M1 door één agent in eigen worktree (`../chatmanta-v0-pad`); reviewloop light; PR 1 → merge na Seb-akkoord.
- M2 sequentieel (fundament), daarna M3a-d + M4 als Workflow `pipeline()` met `isolation: 'worktree'`; orchestrator integreert in `feat/seb/marketing-site`.
- Na elke milestone: `npm run typecheck` + relevante tests; kleine commits.
