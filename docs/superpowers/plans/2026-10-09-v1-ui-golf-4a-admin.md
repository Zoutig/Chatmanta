# Plan: V1 UI-redesign golf 4a (admin-schil, skeletten, lijstpagina's)

Spec: `docs/superpowers/specs/2026-10-09-v1-ui-golf-4a-admin-design.md`. Herzien na plan-panel (scope, randgevallen, harde regels); wijzigingen gemarkeerd met *(panel)*.

Werkregels: één commit per taak (`feat(v1-ui): …`), na elke taak `npm run typecheck` + `npm run test:unit`, `git checkout -- AGENTS.md` vóór elke commit. Geen wijzigingen aan server actions, queries, V0 (`app/admindashboard/`, `app/klantendashboard/`) of detailpagina's (behalve de drie gedeelde recap-componenten, Task 6). **Sequentieel in één sessie** *(panel: drie agents in één worktree botsen op git-index, typecheck en `.next`)*.

Regels voor alle taken *(panel, harde regels)*:
- In `'use client'`-bestanden alleen `import type` uit `lib/v1/admin/*` en `lib/controlroom/server/*`; nooit `@/lib/supabase/admin` of `@/lib/auth`.
- `DataTable`, `Metric` en `LineChart` blijven server-compatible (geen `'use client'`); interactieve tabellen krijgen gemapte weergaverijen (patroon `JobRow`), geen ruwe query-rijen.
- Geen nieuwe CSS-klassen die al bestaan: nieuwe admin-klassen krijgen prefix `v1-adm-` *(panel: layout-CSS blijft geladen bij soft-navigatie naar het klantendashboard)*.

## Task 1: Admin-bouwstenen + format-helpers
- Files (nieuw): `app/v1/admin/_ui/format.ts` + `__tests__/format.test.ts`, `metric.tsx`, `data-table.tsx`, `reload-button.tsx`, `status-badges.tsx`, `line-chart.tsx`, `filter-chips.tsx`, `admin.css`.
- Approach:
  - `format.ts` (puur): `formatEur`/`formatUsd` via `Intl.NumberFormat('nl-NL', currency)` met altijd beide fraction-digits gezet (≥ 1: 2/2; < 1: 2/3), `signDisplay: 'negative'`, niet-eindig/`null` → "Onbekend", > 0 maar < 0,001 → "< € 0,001"; `formatDateTime`/`formatDate` met `timeZone: 'Europe/Amsterdam'`.
  - `Metric` + `MetricGrid`: zelfde props als V0 `MetricCard` (label, value: ReactNode, sub, tone). Eigen grid `v1-adm-metrics` (3 kolommen, 2 op telefoon) met `data-tone` (ok/warn/danger/accent) op het getal; alleen kleur- en lettertokens hergebruikt *(red-team: `.v1-stats` past niet bij 6 kaarten en kent geen tonen)*.
  - `DataTable` (`v1-adm-table`, scroll binnen de kaart), `ReloadButton` (client, `router.refresh()` + `useTransition`), `status-badges` (alleen Health/Commercial/Technical die de Klanten-lijst en Overzicht gebruiken; V1-`Badge`, Nederlandse labels; `info` → toon `accent`), `FilterChips` (uit Issues/Feedback, linkgebaseerd).
  - `LineChart`: mechanische kopie van V0 `DailyLineChart` met V1-variabelen, server component *(panel: functie-props vanaf de server)*.
- Tests: `format.test.ts` zet `process.env.TZ = 'UTC'` en importeert de helper daarna met `await import()` *(red-team: statische imports lopen eerst)*; checkt een tijdstip over middernacht (`2026-01-01T23:30Z` → 2 jan) en zomertijd; vergelijkt met U+00A0; NaN/Infinity/-0/0,0004/0,9996/1234,5; USD *(panel)*.

## Task 2: Admin-schil
- Files: `app/v1/app/_shell/shell-frame.tsx` (krijgt een `sidebar`-render-prop en `homeHref`; standaard ongewijzigd voor het klantendashboard), `app/v1/app/_shell/sidebar.tsx` (exporteert `NavGroup`, geen gedragswijziging), `app/v1/admin/layout.tsx`, `app/v1/admin/_shell/sidebar.tsx` (client, tellers als props), `_shell/topbar.tsx` (weg).
- Approach *(panel + red-team)*: hergebruik `ShellFrame` (root-element, `data-klant-scope`, `v1-shell`, mobiel menu, Escape, focus). `ShellFrame` krijgt een optionele `sidebar`-render-prop `(close) => ReactNode` en `homeHref`; de klant-props worden optioneel en zonder `sidebar` gedraagt hij zich exact als nu. Omdat de layout een server component is, rendert een kleine client-wrapper `app/v1/admin/_shell/admin-frame.tsx` de `ShellFrame` met de admin-zijbalk; de layout geeft alleen de twee getallen door. De admin-zijbalk rendert zelf `<aside className="v1-sidebar" id="v1-sidebar" aria-label="Hoofdmenu">` (`openNav` en `aria-controls` wijzen daarnaar). Layout: eerst de bestaande gate (`requireJorionAdmin`, `NEXT_REDIRECT` letterlijk doorgooien); pas daarna één `getJorionAdminClient()` en beide tellers via `Promise.all`, elk met eigen fallback naar 0. "Geen toegang" zonder zijbalk (huidig gedrag), als rustige V1-pagina. `klant.css` + `data-klant-scope` blijven tot 4b.
- Tests: Playwright als admin op 1440 + 390 (menu, focus komt in het menu op 390, Escape, actieve markering, tellers); klantendashboard-zijbalk en mobiel menu na de ShellFrame-wijziging opnieuw bekeken; soft-navigatie admin → klantendashboard → Account: cijfers en chips ongewijzigd.

## Task 3: Laadskeletten
- Files: `app/v1/_ui/skeleton.tsx` (variant `table`), 19 × `loading.tsx` onder `app/v1/admin/**`.
- Approach: Overzicht → `overview`; lijsten → `table`; Instellingen → `settings`; gesprek → `conversation`; overige detailroutes → `table`.
- Tests: build; op de Vercel-preview steekproef van 2 routes met vertraagde RSC *(panel: lichter)*.

## Task 4: Pagina's groep A
Overzicht, Klanten, Nieuwe klant, Onboarding, Audit-log. Per pagina: `PageHeader`, bouwstenen, Nederlands, geen emoji, `formatEur`, uitleg > 1 zin → `InfoTip`, lege staat/foutregel/afkappen volgens de spec-randgevallen *(panel)*.

## Task 5: Pagina's groep B
Crawls en taken (client-`<select>`-filter blijft, alleen restyle *(panel)*; datum als label vanaf de server in `JobRow` *(panel: ICU-verschil Node/browser)*; status in het Nederlands), Issues + Feedback (`FilterChips`), Quiz-lijst.

## Task 6: Pagina's groep C
Gebruik en kosten (OpenAI-totaal én de voetnoot die van `realCost.available` afhangt samen in één async child binnen `<Suspense>`, zodat de pagina niet tot 12 s wacht *(panel + red-team)*; budget 0 → "Uit"), Botprestaties (incl. `?org=`; 👍/👎 → "Positief"/"Negatief"), Maandrecap-lijst (+ `[orgId]/components/month-selector|generate-recap-button|signal-dot`; de detailpagina die ze ook gebruikt toont tot 4b gemengde stijl, wordt mee bekeken en in de PR gemeld), Instellingen (+ `faq-cadence-control` als `Segmented`).

## Task 7: Verificatie
- Grep op de 4a-bestanden naar `klant-|--klant|klantendashboard|admindashboard|controlroom/format|formatCostEur` → leeg, met als enige toegestane uitzonderingen de `klant.css`-import en `data-klant-scope` (via ShellFrame) *(panel)*.
- `grep` client-bestanden onder `app/v1/admin` op `supabase/admin|lib/auth` → leeg.
- `git diff origin/main --stat -- app/admindashboard app/klantendashboard` leeg.
- Review: losse Claude-review-agent + `chatmanta-reviewer` (Codex werkt niet op deze machine); schone `next build`; Playwright 1440/390 per pagina als admin; Vercel-preview (200, geen `pageerror`/hydration, skeletten).

## Bewust geaccepteerd (red-team)
- `loading.tsx` dekt de eigen wachttijd van de admin-layout (gate + tellers) niet; bij een harde load of vanuit `/v1/app` verschijnt de schil pas daarna. Twee kleine count-queries, bewust geaccepteerd.

## Bewust niet (uit het panel)
- Parallelle agents (zie werkregels).
- `NavGroup` naar `_ui` verhuizen: export uit de bestaande file volstaat.
- Jobs-filter naar links omzetten (zou de werking veranderen).
