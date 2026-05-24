# Klantendashboard Banner-accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De Overzicht-banners van het klantendashboard tonen één kloppend "onbeantwoord"-getal (= onbeantwoorde gesprekken laatste 30 dagen), linken naar exact die lijst, en zijn wegklikbaar tot een nieuwe gap binnenkomt.

**Architecture:** Eén bron van waarheid: `countUnansweredThreads` hergebruikt `listConversations(orgSlug, 'unanswered')`, zodat het bannergetal per definitie gelijk is aan de rijen op `/gesprekken?filter=unanswered`. De `unanswered`-filter krijgt daarvoor een 30-dagen-venster. Banners worden gewrapt in een client-component `DismissibleBanner` die per banner een dismiss-signature in `localStorage` bewaart.

**Tech Stack:** Next.js 16 App Router (server components), TypeScript, Supabase service-role reads, lucide-react iconen, inline styles + `klant.css` tokens.

**Testverantwoording (afwijking van strikte TDD):** Het klantendashboard heeft geen e2e/unit-harness (bestaande Playwright-specs dekken alleen de V0-chat-UI). Een auth+cookie+seed-harness bouwen voor één banner-fix valt buiten de minimale scope (AGENTS.md: "minimaal eerst"). Verificatie loopt daarom via `npm run typecheck` per task + een browser-verificatiepass (Task 5) tegen de dev-server.

---

### Task 1: Eén bron van waarheid voor "onbeantwoord"

**Files:**
- Modify: `lib/v0/klantendashboard/server/conversations.ts` (`sinceFilter` + nieuwe `countUnansweredThreads`)
- Modify: `lib/v0/klantendashboard/types.ts` (`OverviewMetrics.latestUnansweredAt`)
- Modify: `lib/v0/klantendashboard/server/metrics.ts` (gebruik nieuwe count, 30d-venster op lijst, verwijder dode teller)

- [ ] **Step 1: Geef de `unanswered`-filter een 30-dagen-venster**

In `conversations.ts`, in `sinceFilter`, voeg `unanswered` toe aan de 30-dagen-tak zodat de doorklik-lijst en de banner exact hetzelfde universum gebruiken:

```ts
function sinceFilter(filter: ConversationFilter): string | null {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (filter === 'today') return d.toISOString();
  if (filter === 'last_7_days') {
    d.setDate(d.getDate() - 6);
    return d.toISOString();
  }
  // 'unanswered' deelt het 30-dagen-venster van 'last_30_days' zodat het
  // Overzicht-bannergetal exact gelijk is aan wat deze gefilterde lijst toont.
  if (filter === 'last_30_days' || filter === 'unanswered') {
    d.setDate(d.getDate() - 29);
    return d.toISOString();
  }
  return null;
}
```

- [ ] **Step 2: Voeg `countUnansweredThreads` toe**

Onderaan `conversations.ts` (na `getConversationDetail`):

```ts
// ---------------------------------------------------------------------------
// countUnansweredThreads — DE bron van waarheid voor het Overzicht-scherm.
// Hergebruikt listConversations('unanswered') zodat het getal per definitie
// gelijk is aan de rijen op /klantendashboard/gesprekken?filter=unanswered.
// latestUnansweredAt voedt de dismiss-signature van de banner: verandert dit
// (nieuwe onbeantwoorde vraag), dan komt een weggeklikte banner weer terug.
// ---------------------------------------------------------------------------
export async function countUnansweredThreads(
  orgSlug: OrgSlug,
): Promise<{ count: number; latestUnansweredAt: string | null }> {
  const items = await listConversations(orgSlug, 'unanswered');
  // items zijn al gesorteerd op updated_at desc; [0] is dus de meest recente.
  return {
    count: items.length,
    latestUnansweredAt: items[0]?.lastActivityAt ?? null,
  };
}
```

- [ ] **Step 3: Breid `OverviewMetrics` uit met `latestUnansweredAt`**

In `types.ts`, in `OverviewMetrics`:

```ts
export type OverviewMetrics = {
  chatbotStatus: ChatbotStatus;
  widgetStatus: WidgetStatus;
  sources: {
    websitePages: number;
    documents: number;
    qaItems: number;
  };
  conversationsThisMonth: {
    threads: number;
    messages: number;
  };
  unansweredCount: number;
  /** Updated_at van de meest recente onbeantwoorde thread (laatste 30 dagen),
   *  of null. Voedt de dismiss-signature van de Overzicht-banner. */
  latestUnansweredAt: string | null;
};
```

- [ ] **Step 4: Laat `getOverviewMetrics` de nieuwe count gebruiken**

In `metrics.ts`, voeg bovenaan de import toe:

```ts
import { countUnansweredThreads } from './conversations';
```

Vervang in `getOverviewMetrics` de Promise.all-tak `countFallbacksAllTime(orgId)` door `countUnansweredThreads(orgSlug)`:

```ts
  const [docs, unanswered, monthlyStats, websitePages, settings] = await Promise.all([
    listDocs(orgId).catch(() => []),
    countUnansweredThreads(orgSlug),
    countConversationsThisMonth(orgId),
    Promise.resolve(getMockWebsitePages(orgSlug)),
    getOrgSettings(orgSlug),
  ]);
```

En pas het `return`-object aan:

```ts
  return {
    chatbotStatus,
    widgetStatus,
    sources: {
      websitePages: websitePages.filter((p) => p.status === 'active').length,
      documents: docs.length,
      qaItems: qaItems.filter((q) => q.active).length,
    },
    conversationsThisMonth: monthlyStats,
    unansweredCount: unanswered.count,
    latestUnansweredAt: unanswered.latestUnansweredAt,
  };
```

- [ ] **Step 5: Verwijder de nu dode `countFallbacksAllTime`**

In `metrics.ts`, verwijder de volledige functie `countFallbacksAllTime` (de all-time fallback-teller is vervangen). `countMessagesAllTime` en `countConversationsThisMonth` blijven staan.

- [ ] **Step 6: Geef de Overzicht-lijst hetzelfde 30-dagen-venster**

In `metrics.ts`, geef `getUnansweredQuestions` een `sinceDays`-param (default 30) en filter op `created_at`:

```ts
export async function getUnansweredQuestions(
  orgSlug: OrgSlug,
  limit = 10,
  sinceDays = 30,
): Promise<UnansweredQuestion[]> {
  const orgId = KNOWN_ORGS[orgSlug].id;
  try {
    const since = new Date();
    since.setDate(since.getDate() - (sinceDays - 1));
    since.setHours(0, 0, 0, 0);
    const { data, error } = await sb()
      .from('query_log')
      .select('question, created_at')
      .eq('organization_id', orgId)
      .eq('kind', 'fallback')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !data) return [];
    // ... (rest van de functie ongewijzigd: groeperen + sorteren + slice)
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS (geen errors). Als TS klaagt dat `latestUnansweredAt` ontbreekt op een ander OverviewMetrics-literal: zoek met grep naar `unansweredCount:` en voeg `latestUnansweredAt` daar ook toe.

- [ ] **Step 8: Commit**

```bash
git add lib/v0/klantendashboard/server/conversations.ts lib/v0/klantendashboard/server/metrics.ts lib/v0/klantendashboard/types.ts
git commit -m "fix(klant): tel onbeantwoord als gesprekken (30d), één bron van waarheid"
```

---

### Task 2: ✕-knop op WarningBanner

**Files:**
- Modify: `app/klantendashboard/components/warning-banner.tsx`

- [ ] **Step 1: Voeg een optionele `onDismiss`-prop + ✕-knop toe**

Importeer `X` erbij en voeg de prop toe. Volledige nieuwe versie van het component:

```tsx
import Link from 'next/link';
import { AlertTriangle, Info, CheckCircle2, X } from 'lucide-react';

type Variant = 'warning' | 'info' | 'success';

export function WarningBanner({
  variant = 'warning',
  title,
  message,
  cta,
  onDismiss,
}: {
  variant?: Variant;
  title: string;
  message: string;
  cta?: { label: string; href: string };
  /** Wanneer aanwezig: render een ✕-knop rechtsboven. Vereist client-context
   *  (de banner wordt dan gerenderd binnen DismissibleBanner). */
  onDismiss?: () => void;
}) {
  const cfg = {
    warning: {
      Icon: AlertTriangle,
      bg: 'var(--klant-warning-soft)',
      border: 'rgba(251, 191, 36, 0.32)',
      color: 'var(--klant-warning)',
    },
    info: {
      Icon: Info,
      bg: 'var(--klant-info-soft)',
      border: 'rgba(96, 165, 250, 0.32)',
      color: 'var(--klant-info)',
    },
    success: {
      Icon: CheckCircle2,
      bg: 'var(--klant-success-soft)',
      border: 'rgba(52, 211, 153, 0.32)',
      color: 'var(--klant-success)',
    },
  }[variant];

  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        padding: '14px 16px',
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 'var(--klant-r-md)',
        alignItems: 'flex-start',
      }}
      role={variant === 'warning' ? 'alert' : 'note'}
    >
      <div style={{ color: cfg.color, marginTop: 2, flexShrink: 0 }}>
        <cfg.Icon size={18} strokeWidth={1.8} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--klant-fg)',
            marginBottom: 2,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--klant-fg-muted)', lineHeight: 1.5 }}>{message}</div>
      </div>
      {cta && (
        <Link
          href={cta.href}
          className="klant-btn"
          style={{
            textDecoration: 'none',
            flexShrink: 0,
            background: 'var(--klant-bg-elev)',
          }}
        >
          {cta.label}
        </Link>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Melding sluiten"
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4,
            marginTop: -2,
            marginRight: -4,
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--klant-r-sm)',
            cursor: 'pointer',
            color: 'var(--klant-fg-muted)',
          }}
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/klantendashboard/components/warning-banner.tsx
git commit -m "feat(klant): optionele sluit-knop op WarningBanner"
```

---

### Task 3: DismissibleBanner client-component

**Files:**
- Create: `app/klantendashboard/components/dismissible-banner.tsx`

- [ ] **Step 1: Schrijf het component**

```tsx
'use client';

// Wrapt WarningBanner met wegklik-gedrag dat per banner een "signature" in
// localStorage bewaart. Komt de signature later niet meer overeen (bijv. omdat
// er een nieuwe onbeantwoorde vraag is bijgekomen), dan verschijnt de banner
// opnieuw. Past bij V0: geen per-user identiteit, dus client-side opslag is hier
// het juiste niveau.

import { useEffect, useState } from 'react';
import { WarningBanner } from './warning-banner';

type Variant = 'warning' | 'info' | 'success';

const KEY_PREFIX = 'klant-banner-dismiss:';

export function DismissibleBanner({
  dismissId,
  signature,
  variant,
  title,
  message,
  cta,
}: {
  /** Stabiele sleutel per banner-type, bv. "unanswered". */
  dismissId: string;
  /** Verandert wanneer de onderliggende situatie verandert (count/timestamp). */
  signature: string;
  variant?: Variant;
  title: string;
  message: string;
  cta?: { label: string; href: string };
}) {
  // Start verborgen tot useEffect localStorage heeft gelezen — voorkomt dat een
  // al-weggeklikte banner kort in beeld flitst na hydration.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY_PREFIX + dismissId);
      setVisible(stored !== signature);
    } catch {
      // localStorage onbereikbaar (private mode e.d.) → gewoon tonen.
      setVisible(true);
    }
  }, [dismissId, signature]);

  function dismiss() {
    try {
      window.localStorage.setItem(KEY_PREFIX + dismissId, signature);
    } catch {
      // Opslaan mislukt → banner sluit alsnog visueel voor deze sessie.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <WarningBanner
      variant={variant}
      title={title}
      message={message}
      cta={cta}
      onDismiss={dismiss}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/klantendashboard/components/dismissible-banner.tsx
git commit -m "feat(klant): DismissibleBanner met localStorage-signature"
```

---

### Task 4: Overzicht-pagina bedraden

**Files:**
- Modify: `app/klantendashboard/page.tsx`

- [ ] **Step 1: Wissel de import van WarningBanner naar DismissibleBanner**

Vervang regel `import { WarningBanner } from './warning-banner';` door:

```tsx
import { DismissibleBanner } from './components/dismissible-banner';
```

(De `WarningBanner` wordt niet meer direct in `page.tsx` gebruikt; hij leeft nu binnen `DismissibleBanner`.)

- [ ] **Step 2: Vervang de drie banner-blokken**

Vervang het hele `{/* Warnings — gestapeld */}`-blok door:

```tsx
      {/* Warnings — gestapeld. Elk wegklikbaar; de onbeantwoord-banner komt
          terug zodra count of latestUnansweredAt verandert (nieuwe gap). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {!hasAnySource && (
          <DismissibleBanner
            dismissId="no-sources"
            signature="active"
            variant="warning"
            title="Je hebt nog geen bronnen toegevoegd"
            message="Voeg websitepagina's, documenten of Q&A toe zodat je chatbot vragen kan beantwoorden."
            cta={{ label: 'Bronnen toevoegen', href: '/klantendashboard/kennisbank' }}
          />
        )}
        {metrics.widgetStatus === 'not_installed' && hasAnySource && (
          <DismissibleBanner
            dismissId="widget-not-installed"
            signature="active"
            variant="info"
            title="Je widget is nog niet geplaatst"
            message="Plaats de embed-code op je website om je chatbot zichtbaar te maken voor bezoekers."
            cta={{ label: 'Widget installeren', href: '/klantendashboard/widget' }}
          />
        )}
        {metrics.unansweredCount > 0 && (
          <DismissibleBanner
            dismissId="unanswered"
            signature={`${metrics.unansweredCount}:${metrics.latestUnansweredAt ?? ''}`}
            variant="info"
            title={
              metrics.unansweredCount === 1
                ? 'Er is 1 onbeantwoorde vraag'
                : `Er zijn ${metrics.unansweredCount} onbeantwoorde vragen`
            }
            message="Dit zijn gesprekken van de laatste 30 dagen waar je chatbot geen goed antwoord op had. Voeg kennis toe om ze te verhelpen."
            cta={{ label: 'Bekijken', href: '/klantendashboard/gesprekken?filter=unanswered' }}
          />
        )}
      </div>
```

- [ ] **Step 3: Fix de metriccard-bestemming + label**

In de `MetricCard` met `title="Onbeantwoorde vragen"`, wijzig `href` en `cta` zodat hij naar dezelfde lijst leidt als de banner:

```tsx
          <MetricCard
            title="Onbeantwoorde vragen"
            primary={String(metrics.unansweredCount)}
            secondary={
              metrics.unansweredCount === 0
                ? 'Alle vragen tot nu toe beantwoord.'
                : 'Gesprekken (laatste 30 dagen) zonder goed antwoord.'
            }
            icon={HelpCircle}
            href="/klantendashboard/gesprekken?filter=unanswered"
            cta="Bekijk gesprekken"
            tone={metrics.unansweredCount > 0 ? 'warning' : 'neutral'}
          />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/klantendashboard/page.tsx
git commit -m "feat(klant): wegklikbare banners + kloppende doorklik op Overzicht"
```

---

### Task 5: Verificatie (browser + typecheck) + graph

**Files:** geen code-wijzigingen; dit is de verificatiepass.

- [ ] **Step 1: Volledige typecheck**

Run: `npm run typecheck`
Expected: PASS, geen errors.

- [ ] **Step 2: Start dev-server**

Run: `npm run dev` (poort 3000; als bezet: `next dev -p 3001`).
Wacht tot "Ready" in de output.

- [ ] **Step 3: Verifieer getal-gelijkheid (acceptatiecriterium #1 & #2)**

Open in de browser (via browser-harness/Playwright MCP), met een org die onbeantwoorde gesprekken heeft (kies de org via de org-switcher of `?org=<slug>`):
1. `/klantendashboard` — lees het getal in de onbeantwoord-banner én op de metriccard "Onbeantwoorde vragen". Deze moeten gelijk zijn.
2. Klik "Bekijken" (of de metriccard) → je belandt op `/klantendashboard/gesprekken?filter=unanswered`. Tel de tabelrijen.
3. Bevestig: bannergetal == metriccardgetal == aantal rijen. Maak een screenshot.

- [ ] **Step 4: Verifieer 0-geval (acceptatiecriterium #3)**

Switch naar een org zonder recente onbeantwoorde gesprekken (of een verse org). Bevestig: geen onbeantwoord-banner, metriccard toont `0` met neutrale toon (geen warning-kleur).

- [ ] **Step 5: Verifieer wegklikken + persistentie (acceptatiecriterium #5)**

Op een org mét de banner: klik de ✕. Banner verdwijnt. Reload de pagina (F5). Bevestig: banner blijft weg. Controleer in DevTools → Application → Local Storage dat `klant-banner-dismiss:unanswered` de waarde `"<count>:<timestamp>"` heeft.

- [ ] **Step 6: Verifieer reappear-on-change (acceptatiecriterium #6)**

In DevTools-console: `localStorage.setItem('klant-banner-dismiss:unanswered', 'stale-signature')` en reload. Bevestig: de banner verschijnt weer (opgeslagen signature ≠ huidige signature simuleert een nieuwe gap).

- [ ] **Step 7: Update de graaf (geen API-cost)**

Run: `graphify update .`

- [ ] **Step 8: Commit graaf-output indien getrackt**

```bash
# graphify-out is gitignored — alleen committen als git diff iets toont:
git status --porcelain graphify-out/ && echo "(gitignored — niets te committen, overslaan)"
```

---

## Definition of Done

- [ ] `npm run typecheck` slaagt.
- [ ] Bannergetal == metriccardgetal == rijen op `/gesprekken?filter=unanswered` (Step 3).
- [ ] 0 onbeantwoord → geen banner, neutrale metriccard (Step 4).
- [ ] ✕ verbergt de banner en blijft weg na reload (Step 5).
- [ ] Gewijzigde signature laat de banner terugkomen (Step 6).
- [ ] Test-pagina-vragen verhogen het getal niet (gevolg van thread-based tellen; geen aparte test nodig).
