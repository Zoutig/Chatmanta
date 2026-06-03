# Bouwplan — Maandelijkse Recap

Canonieke spec: `docs/superpowers/specs/2026-06-02-maandelijkse-recap-design.md` (goedgekeurd via /intake).
Migratie gereserveerd: **0047** (0045 lokaal/main + 0046 geclaimd door PR #170 → next safe 0047).

## Acceptatiecriteria (testbaar)

- [ ] Migratie 0047 maakt `admin_monthly_recaps` + `admin_recap_signals`: `organization_id NOT NULL` (geen FK), RLS **uit** + carve-out-comment, hergebruik `admin_touch_updated_at()`-trigger, CHECK-enums, `unique(organization_id, period_month)`, cascade op signals. `npm run migrate:status` toont toegepast.
- [ ] `/admindashboard/maandelijkse-recap`: cross-org tabel — per klant gesprekken, unieke (widget-)bezoekers, onbeantwoord, signalering-bol (🟢🟡🔴 live), notitie-indicator, "Bekijk →". Maandselector default = **laatst afgesloten** maand; "Lopende maand (onvolledig)" als aparte optie.
- [ ] Sidebar-NavItem "Maandelijkse Recap" (`CalendarRange`); werkt ≤900px zonder footer-links af te knippen.
- [ ] `/admindashboard/maandelijkse-recap/[orgSlug]`: 6 statistiek-cards (live), top-3-5 vragen, onbeantwoorde vragen, AI-samenvatting, signaleringen met `[Negeren]`/`[Markeer behandeld]`, notitieveld (opslaan), "Eerdere recaps"-archief. Header: `ReloadButton` + "Gegenereerd door: Niels Jochems — ChatManta".
- [ ] "Recap genereren" → AI-samenvatting (gpt-4o-mini) + artefacten opgeslagen; bestaat al → "Opnieuw genereren" met overschrijf-waarschuwing; **notities + signaal-triage blijven behouden**.
- [ ] Stats kloppen met bestaande dashboards: "onbeantwoord" = `query_log` fallback-telling doelmaand; per-gesprek-stats uit `v0_threads`/`v0_thread_messages`; geen join op `query_log`.
- [ ] Signaleringen deterministisch: `fallbackPct>20`, vraag ≥15× onbeantwoord, piekuur buiten 08:00–18:00, 0 gesprekken. (`korte_gesprekken`/`lage_engagement` bestaan NIET.)
- [ ] Getoonde bezoeker-vraagteksten door `redactPii()` in de recap-datalaag.
- [ ] PDF: `GET /api/v0/pdf/recap/[orgSlug]/[month]` → PDF (`@react-pdf/renderer`, `runtime='nodejs'`): header→stats→top→onbeantwoord→samenvatting→actieve signaleringen→notities→footer `ChatManta — niels@chatmanta.com`. Bestandsnaam `ChatManta_Recap_[Bedrijf]_[Jaar]-[Maand].pdf`. Cookie-auth + org-isolatie.
- [ ] Randgevallen: 0 gesprekken → EmptyInline + LLM-skip + "Genereren" uit; AI-faal → leeg veld + melding; fan-out-faal per org isoleert (geen 500).
- [ ] `npx next build` groen (na `Remove-Item .next`); typecheck groen; unit-tests `computeSignals` + maand-utilities groen.

## Out of scope (expliciet NIET nu)

- Geen `thread_id`-kolom op `query_log` (stats per bron gepartitioneerd, geen join).
- Geen repo-brede `redactPii` op gedeelde klantendashboard-helpers — alleen recap-datalaag (bestaande gap = aparte follow-up).
- Geen embeddings-clustering voor top-vragen (hergebruik bestaande paden).
- Geen cron/precompute (on-demand; comment als debt). Geen model-keuze-UI, geen LLM cost-cap.
- Geen chromium/puppeteer voor PDF. Geen `korte_gesprekken`/`lage_engagement`.

## Taken (1 commit per taak; typecheck na elke taak)

**Taak 1 — migratie 0047 + types.** `supabase/migrations/0047_admin_monthly_recap.sql`, `lib/controlroom/types.ts`. Twee `admin_*`-tabellen volgens 0043-precedent. TS-unions `RecapStatus='draft'|'gepubliceerd'`, `RecapSignalType`, `SignalStatus='nieuw'|'genegeerd'|'behandeld'`. `npm run migrate`. Test: `migrate:status`.

**Taak 2 — historische-maand kosten-helpers.** `lib/controlroom/server/usage.ts`: `getMonthlyCostUsdForRange`, `getDailyCostForMonth`, `monthRangeIso(year,month)`. Test: maand-grens-util (dec→jan).

**Taak 3 — recap-datalaag.** `lib/controlroom/server/recap.ts` (`'server-only'`): `lastCompleteMonth()`, `getRecapStats` (per-bron), `computeSignals` (pure, deterministisch), top/onbeantwoord via bestaande helpers + `redactPii`, `getRecapArtifacts`/`listRecapMonths`. Test: `computeSignals` unit-tests.

**Taak 4 — AI-samenvatting + server-actions.** `lib/controlroom/server/recap-llm.ts`, `app/actions/recap.ts`: `generateRecapSummary` via `chatComplete` (gpt-4o-mini, geaggregeerde input, skip bij 0). Actions `generateRecapAction`/`saveRecapNotesAction`/`setSignalStatusAction` — `requireV0Auth`, org uit `KNOWN_ORGS`, upsert `(org, period_month)`. Test: typecheck + actie-rooktest.

**Taak 5 — cross-org overzichtspagina + sidebar.** `app/admindashboard/maandelijkse-recap/page.tsx` + components, `sidebar.tsx`. `force-dynamic`, `getControlRoomKlanten` + live signalering, maandselector. Test: Playwright (5c).

**Taak 6 — per-klant detailpagina.** `app/admindashboard/maandelijkse-recap/[orgSlug]/page.tsx` + client-components (notities, signaal-acties, genereer-knop `useTransition`). `KNOWN_ORGS`-validatie. Test: Playwright.

**Taak 7 — PDF-export.** `package.json` (+`@react-pdf/renderer`), `next.config.ts` (`serverExternalPackages`), `app/api/v0/pdf/recap/[orgSlug]/[month]/route.ts` + PDF-document. GET, `runtime='nodejs'`, cookie-auth + org-isolatie. Test: route levert `application/pdf`.

**Taak 8 — build + tests groen.** `Remove-Item -Recurse -Force .next; npx next build`; typecheck/test. Fix tot groen.
