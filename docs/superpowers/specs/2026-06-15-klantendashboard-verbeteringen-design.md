# Klantendashboard — 11 verbeteringen (design + plan)

**Datum:** 2026-06-15 · **Branch:** `feat/seb/klantdash-verbeteringen` · **Worktree:** `../chatmanta-klantdash`
**Aanpak:** big-ship (recon → toernooi → plan-review-loop → milestone-build → review-loop).

## Doel

Een pakket van 11 UI/UX- en functionele verbeteringen aan het V0-klantendashboard, over 8 tabs.
Kwaliteit boven snelheid, maar "minimaal eerst" per item. Alles V0
(`app/klantendashboard/*`, `lib/v0/klantendashboard/*`); widget-API niet geraakt.

## Hard rules (bewaakt door de plan-review + `chatmanta-reviewer`)

- Styling via `klant.css` `--klant-*` tokens + inline styles. **Geen** Tailwind-classes, **geen** inline `:hover` (interactieve states → `klant.css`-classes).
- Persistentie via `v0_org_settings` jsonb partial-merge. Nieuw veld = migratie + SELECT-lijst + type + writer, anders droppen reads het stil. **Uitzondering:** nieuwe state via een *dedicated 1-koloms-upsert* (zoals `saveAccountInfo`), niet via `writeOrgSettings`.
- Server-actions resolven org **uit de cookie**, nooit client-slug. Revalidate `('/klantendashboard','layout')`.
- **Widget-runtime is off-limits:** `app/widget/components/chatmanta-widget.tsx` en `/api/v0/widget/*` mounten mag, **bewerken niet**.
- Migratie: claim het nummer via `/check-migration` op PR-moment. `0049` is gemerged; eerstvolgende = `0050`.
- V0-sandbox is bewust niet multi-tenant-veilig.

## Resolved decisions (autoritair)

- **D1 (item 3, FAQ):** hergebruik de bestaande `lib/v0/server/faq-snapshot.ts` engine (embeddings + greedy clustering cosine 0.88, `faq_snapshot`-tabel migr 0020, `member_questions` per cluster). De klant-tab gaat hieruit **lezen** (venster `all`). Verversing via **cron**, met cadans **wekelijks of maandelijks, instelbaar in het admin-dashboard** (staleness-gate). Cron is `CRON_SECRET`-gated, kostencap (~$0,10/org/tick, skip-als-vers, `maxDuration`), en roept **geen** `purgeAnswerCache` aan. Doorklik "alle gesprekken met deze vraag" = benaderende tekst+tijdvenster-match (geen `query_log↔v0_threads` FK; expliciet "goed genoeg", niet exact).
- **D2 (items 5 & 9, preview):** screenshot van de echte site (per-org `websiteUrl`) als achtergrond + de echte `ChatMantaWidget` erop gemount. Capture via Firecrawl-screenshot-actie (bestaat in SDK), eenmalig/cron, pad opgeslagen, **nooit per-render**; harde fallback naar `WidgetMockup` bij fout/lege URL. "Test" → label **"Preview Chatbot"**; **route blijft `/test`**.
- **D3 (item 11, Q&A):** on-demand knop "Toon wat de bot nu antwoordt" (volle RAG via `askTestQuestion` op `LATEST_BOT_VERSION`, laadstate), read-only boven het herschrijf-veld. Opslaan via het **echte** `upsertQAItem`-pad; de huidige `setTimeout`-nepknop wordt verwijderd. Huidig antwoord vastleggen **vóór** opslaan.
- **D4 (item 2, overslaan):** skip-state als jsonb-veld op `v0_org_settings` via dedicated upsert. "Overslaan" = taak als **gedaan** tonen; echte voltooiing wint altijd (idempotent). Hover-knop via `klant.css`-class.

## Verificaties (uitgevoerd, groen)

- `lib/v0/server/faq-snapshot.ts` + migr `0020` + `app/actions/faq.ts` + `app/components/faq-view.tsx` bestaan → item 3 = reuse.
- Firecrawl-SDK (`@mendable/firecrawl-js` v4.25) heeft een screenshot-actie → item 9 bouwbaar.
- Per-org `websiteUrl` in `lib/v0/klantendashboard/mock/account.ts` (1 org leeg → fallback).

## Milestones

| # | Titel | Items | Afhankelijk | PR-groep |
|---|-------|-------|-------------|----------|
| M1 | Migratie + `setup_skips` (dedicated upsert) | 2 | onafhankelijk | 1 |
| M2 | href-audit · urgentie-knoppen · account-autofill | 1,7,8 | na M1 (settings.ts) | 1 |
| M3 | Bronnen-lezer (gedeelde reconstruct-helper + modal) | 10 | onafhankelijk | 2 |
| M4 | FAQ-cron (reuse engine, gated, kostencap) + admin-cadans | 3 | na M1 | 3 |
| M5 | FAQ lees-tab + doorklik · Instellingen-relocate | 3,6 | na M4+M1 | 3 |
| M6 | Widget screenshot-capture (fallback) | 9 | onafhankelijk* | 4 |
| M7 | Preview-tab + echte widget gemount · kleurkiezer | 4,5,9 | na M6 | 4 |
| M8 | Q&A écht-opslaan + "toon huidig antwoord" | 11 | na M5+M1 | 5 |

\*M6's eventuele migratiekolom landt in zijn eigen PR-migratie (per-PR `/check-migration`).

**Bouwvolgorde:** PR1 (M1→M2) → PR2 (M3) → PR3 (M4→M5) → PR4 (M6→M7) → PR5 (M8).
`settings.ts` is een serialisatiepunt; de M1→M2/M4→M5→M8-keten loopt sequentieel. M3 en M6/M7 kunnen ernaast.

### Acceptance per milestone

- **M1:** `check-migration` = 0050; skip overleeft drie opeenvolgende writers (skip → `saveWidgetSettings` → `saveAccountInfo`); `saveSetupSkips` noemt alleen `organization_id`+`setup_skips`; `writeOrgSettings` ongewijzigd; typecheck groen.
- **M2:** taak-klik landt op juiste route+sub-tab; account pre-fillt + slaat op met bestaande `EMAIL_RE` (geen duplicaat); urgentie-knoppen segmented in `klant.css`; typecheck groen.
- **M3:** reconstructie via gedeelde helper (admin importeert 'm); geen `rag.ts`-import; Escape sluit modal; build schoon.
- **M4:** cron 401 zonder Bearer `CRON_SECRET`; geen `purgeAnswerCache`; dedupe vóór embed + volume-guard + USD-plafond + `maxDuration`; klant-wrapper org-uit-cookie; admin-cadans (wekelijks/maandelijks) opgeslagen+gelezen; typecheck groen.
- **M5:** nul embedding-calls in render-pad; `saveTopQuestionsConfig` blijft purge-vrij; FAQ-config niet meer onder Instellingen; doorklik toont gesprekken via `member_questions`; typecheck groen.
- **M6:** screenshot-pad opgeslagen, nooit per-render; fallback naar `WidgetMockup`; hergebruikt `feedback-attachments`-bucket; `saveWidgetPreview` dedicated upsert; typecheck groen.
- **M7:** Playwright: FAB binnen preview-container (anders escaleren); git-diff van widget-runtime + `/api/v0/widget/*` leeg; "Preview Chatbot"-label incl. `tests/global-setup.ts`; build schoon.
- **M8:** antwoord vastgelegd vóór save; save-pad is letterlijk `upsertQAItem` (purge vuurt); `setTimeout`-mock weg uit `chat-preview.tsx`; typecheck groen.

## Out of scope

Geen widget-runtime-edits · org-uit-cookie · geen nieuwe klant-snapshot-tabel (reuse `faq_snapshot`) · geen exacte thread-join (benaderend) · geen nieuwe storage-bucket · geen nieuwe botversie · geen per-org scheduling-UI · geen extra dashboard-dimensies · URL `/test` blijft.

## Risico's

1. FAQ-cron embedding-kosten schalen met volume → volume-guard + USD-plafond hard afdwingen.
2. `faq_snapshot` is botversie-gepartitioneerd; klant-view is versie-agnostisch → read-wrapper kiest canonieke versie/aggregeert (documenteren bij M4).
3. Widget-FAB `position:fixed` kan uit de preview-container ontsnappen → `transform/contain`-wrapper; bij falen escaleren (geen runtime-edit).
4. Veel milestones raken `settings.ts` → afhankelijkheids-edges respecteren, niet blind parallel bouwen.
5. Admin-cadans-opslag = klein datamodel-besluit (eerst-overleggen) → minimale reuse van bestaande admin-surface bij M4.
