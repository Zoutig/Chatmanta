# Embeddable widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De klantendashboard-widget echt embeddable maken op externe pagina's (zonder demo-login), gescoped op één org, met een token-beveiligde chat-API en werkende installatie-detectie.

**Architecture:** Een statische `widget.js`-loader injecteert een `<iframe>` naar een nieuwe publieke route `/embed/[slug]` die de bestaande React-`ChatMantaWidget` rendert. De chat-fetch draait same-origin binnen de iframe (geen CORS). De wachtwoord-gate wordt voor `/embed` + chat/ping-API uitgezet; in plaats daarvan eist de chat-route een geldig V0-cookie **OF** een kortlevend, org-gebonden HMAC-token + origin-lock (fail-closed). De embed-iframe pingt bij load → server schrijft `lastSeenAt`/`installOrigin` in de bestaande `v0_org_settings.widget` jsonb (geen migration).

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Node `crypto` (HMAC), bestaande rate-limiter (`lib/v0/server/rate-limit.ts`), Playwright (e2e), `tsx` (logic-test).

**Spec:** `docs/superpowers/specs/2026-05-25-widget-embed-design.md`

---

## File Structure

**Create:**
- `lib/v0/server/embed-token.ts` — HMAC create/verify van het embed-token (server-only).
- `scripts/dev/embed-token.test.ts` — standalone assertie-test voor de token-logica (via tsx).
- `app/embed/[slug]/page.tsx` — publieke embed-route, rendert alleen de widget + ping-glue.
- `app/embed/[slug]/embed-client.tsx` — client-component: ping-on-load + render `<ChatMantaWidget embedded>`.
- `app/api/v0/widget/ping/route.ts` — heartbeat-endpoint (token+origin-gated, schrijft lastSeenAt).
- `public/widget.js` — statische vanilla-loader (iframe-injectie + resize).
- `public/widget-test.html` — lokale testpagina om de snippet handmatig te proberen.

**Modify:**
- `proxy.ts:26` — matcher: `/embed` + `/api/v0/chat` + `/api/v0/widget` uitzonderen van de login-redirect.
- `app/api/v0/chat/route.ts` — dual-auth-gate (cookie OF token+origin) na de rate-limit-check.
- `app/widget/components/chatmanta-widget.tsx` — props `embedded` + `embedToken` (resize-postMessage + token-header).
- `lib/v0/klantendashboard/types.ts:218-260` — `WidgetSettings` + `lastSeenAt` + `installOrigin`.
- `lib/v0/klantendashboard/mock/widget-settings.ts` — beide nieuwe velden = `null` op alle 5 orgs.
- `app/klantendashboard/actions.ts` — `checkWidgetInstallationAction()` (echte status-read).
- `app/klantendashboard/widget/components/widget-form.tsx` — snippet origin-aware + live-status echt.

---

## Task 0: Worktree-deps + env

**Files:** geen (setup).

- [ ] **Step 1: Installeer dependencies in de worktree**

De worktree is vers en heeft nog geen `node_modules`. Een junction naar de hoofd-repo werkt voor `tsc` maar breekt Turbopack — doe een echte install.

Run: `npm ci`
Expected: exit 0, `node_modules/` aangemaakt.

- [ ] **Step 2: Kopieer env-bestand**

`.env.local` is gitignored en wordt niet meegekopieerd naar een worktree.

Run: `Copy-Item ../chatmanta/.env.local .env.local`
Expected: bestand bestaat. Controleer dat `OPENAI_API_KEY`, `V0_COOKIE_SECRET`, `V0_DEMO_PASSWORD` actief (niet uitgecommentarieerd) zijn.

- [ ] **Step 3: Voeg het embed-token-secret toe aan `.env.local`**

Voeg onderaan toe (genereer een willekeurige 32+ byte string):

```
EMBED_TOKEN_SECRET=vervang-dit-door-een-lange-willekeurige-string-van-32-plus-chars
```

- [ ] **Step 4: Baseline groen**

Run: `npm run typecheck`
Expected: exit 0, geen errors (schone baseline vóór wijzigingen).

---

## Task 1: Embed-token module (TDD)

**Files:**
- Create: `lib/v0/server/embed-token.ts`
- Test: `scripts/dev/embed-token.test.ts`

- [ ] **Step 1: Schrijf de falende test**

Maak `scripts/dev/embed-token.test.ts`:

```ts
// Standalone assertie-test voor het embed-token. Run met:
//   node --env-file=.env.local --conditions=react-server --import tsx scripts/dev/embed-token.test.ts
// Geen unit-framework in deze repo; dit script throwt bij de eerste mismatch.
import assert from 'node:assert/strict';

process.env.EMBED_TOKEN_SECRET = 'test-secret-at-least-32-chars-long-xxxxx';

const { createEmbedToken, verifyEmbedToken } = await import('../../lib/v0/server/embed-token.ts');

// 1. Round-trip: vers token voor acme-corp verifieert tegen dezelfde slug.
const t = createEmbedToken('acme-corp');
assert.equal(verifyEmbedToken(t, 'acme-corp'), true, 'round-trip moet true zijn');

// 2. Verkeerde slug → false (org-binding).
assert.equal(verifyEmbedToken(t, 'globex-inc'), false, 'verkeerde slug moet false zijn');

// 3. Geknoeid token → false.
assert.equal(verifyEmbedToken(t.slice(0, -2) + 'xx', 'acme-corp'), false, 'tampered sig moet false zijn');

// 4. Verlopen token → false (ttl=-1 sec).
const expired = createEmbedToken('acme-corp', -1);
assert.equal(verifyEmbedToken(expired, 'acme-corp'), false, 'verlopen token moet false zijn');

// 5. Leeg/onzin token → false (geen throw).
assert.equal(verifyEmbedToken('', 'acme-corp'), false);
assert.equal(verifyEmbedToken('geen-punt', 'acme-corp'), false);

console.log('embed-token.test.ts: ALLE ASSERTIES GESLAAGD');
```

- [ ] **Step 2: Run de test — verwacht falen**

Run: `node --env-file=.env.local --conditions=react-server --import tsx scripts/dev/embed-token.test.ts`
Expected: FAIL — `Cannot find module '.../lib/v0/server/embed-token.ts'`.

- [ ] **Step 3: Implementeer de module**

Maak `lib/v0/server/embed-token.ts`:

```ts
// Kortlevend, org-gebonden embed-token. Bewijst dat een chat/ping-request van
// onze eigen /embed-pagina komt zonder dat we per-user auth hebben in V0.
//
// Wire-format:  base64url(JSON{slug,exp}) "." base64url(HMAC-SHA256(payload, secret))
// exp = unix-seconden. Verificatie is constant-time op de signature.
//
// Fail-closed: zonder EMBED_TOKEN_SECRET throwt createEmbedToken en geeft
// verifyEmbedToken altijd false — het ongate-pad gaat dan dicht.
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_SEC = Number(process.env.EMBED_TOKEN_TTL_SEC) || 30 * 60;

function secret(): string {
  const s = process.env.EMBED_TOKEN_SECRET;
  if (!s || s.length < 16) {
    throw new Error('EMBED_TOKEN_SECRET missing or too short (min 16 chars)');
  }
  return s;
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Maak een token voor `slug`, geldig `ttlSec` seconden (default 30 min). */
export function createEmbedToken(slug: string, ttlSec: number = DEFAULT_TTL_SEC): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = b64url(JSON.stringify({ slug, exp }));
  return `${payload}.${sign(payload)}`;
}

/** True iff `token` geldig is, niet verlopen, en hoort bij `slug`. Nooit throw. */
export function verifyEmbedToken(token: string | null | undefined, slug: string): boolean {
  if (!token) return false;
  let hasSecret = false;
  try {
    secret();
    hasSecret = true;
  } catch {
    hasSecret = false;
  }
  if (!hasSecret) return false;

  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(payload))) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      slug?: unknown;
      exp?: unknown;
    };
    if (decoded.slug !== slug) return false;
    if (typeof decoded.exp !== 'number') return false;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run de test — verwacht slagen**

Run: `node --env-file=.env.local --conditions=react-server --import tsx scripts/dev/embed-token.test.ts`
Expected: PASS — `embed-token.test.ts: ALLE ASSERTIES GESLAAGD`.

- [ ] **Step 5: Commit**

```bash
git add lib/v0/server/embed-token.ts scripts/dev/embed-token.test.ts
git commit -m "feat(widget-embed): embed-token HMAC module + tsx-test"
```

---

## Task 2: WidgetSettings — installatie-telemetrievelden

**Files:**
- Modify: `lib/v0/klantendashboard/types.ts:257-259`
- Modify: `lib/v0/klantendashboard/mock/widget-settings.ts` (alle 5 orgs)

- [ ] **Step 1: Breid het type uit**

In `lib/v0/klantendashboard/types.ts`, vervang het blok:

```ts
  isInstalled: boolean;
  isActive: boolean;
  lastCheckedAt: string | null;
};
```

door:

```ts
  isInstalled: boolean;
  isActive: boolean;
  lastCheckedAt: string | null;
  /** ISO-tijd van de laatste heartbeat-ping uit een geladen embed-iframe. */
  lastSeenAt: string | null;
  /** Host waar de widget voor het laatst gezien is (uit ?h= van de loader). */
  installOrigin: string | null;
};
```

- [ ] **Step 2: Voeg defaults toe in de mock**

In `lib/v0/klantendashboard/mock/widget-settings.ts`: voeg aan **elk** van de 5 org-objecten (`dev-org`, `acme-corp`, `globex-inc`, `initech`, `demo-nieuw`) na de `lastCheckedAt`-regel toe:

```ts
    lastSeenAt: null,
    installOrigin: null,
```

- [ ] **Step 3: Verifieer typecheck**

Run: `npm run typecheck`
Expected: exit 0 (alle `WidgetSettings`-literals compleet; partial-merge in `getOrgSettings` accepteert de nieuwe optionele jsonb-velden).

- [ ] **Step 4: Commit**

```bash
git add lib/v0/klantendashboard/types.ts lib/v0/klantendashboard/mock/widget-settings.ts
git commit -m "feat(widget-embed): WidgetSettings lastSeenAt + installOrigin (geen migration)"
```

---

## Task 3: Proxy-gate openzetten voor embed + API

**Files:**
- Modify: `proxy.ts:26`

- [ ] **Step 1: Pas de matcher aan**

In `proxy.ts`, vervang de `matcher`-regel:

```ts
  matcher: ['/((?!login|api/v0/cron|_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.svg$).*)'],
```

door (voegt `embed`, `api/v0/chat`, `api/v0/widget` toe aan de uitzonderingen):

```ts
  // /embed/* en de publieke API-paden (chat + widget-ping) gaan NIET door de
  // login-redirect: ze worden vanaf externe pagina's geladen zonder demo-cookie.
  // De chat-route doet zelf dual-auth (cookie OF embed-token + origin-lock);
  // de ping-route idem. Zie app/api/v0/chat/route.ts.
  matcher: [
    '/((?!login|embed|api/v0/cron|api/v0/chat|api/v0/widget|_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.svg$).*)',
  ],
```

- [ ] **Step 2: Verifieer typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "feat(widget-embed): embed + chat/ping API uit de wachtwoord-gate"
```

> ⚠️ Na deze stap is `/api/v0/chat` publiek bereikbaar tot Task 4 de auth-gate toevoegt. Voer Task 4 in dezelfde sessie uit; merge niet tussendoor.

---

## Task 4: Chat-route dual-auth (cookie OF token + origin)

**Files:**
- Modify: `app/api/v0/chat/route.ts` (imports + nieuw blok na de rate-limit-check, ~regel 123)

- [ ] **Step 1: Voeg imports toe**

Bovenaan `app/api/v0/chat/route.ts`, bij de bestaande imports, toevoegen:

```ts
import { AUTH_COOKIE, verifyAuthCookieValue } from '@/lib/v0/auth-cookie';
import { verifyEmbedToken } from '@/lib/v0/server/embed-token';
import { resolveOrgSlugFromId } from '@/lib/v0/server/active-org';
```

> `getActiveOrgId` wordt al geïmporteerd; `resolveOrgSlugFromId` staat al in de bestaande import van `@/lib/v0/server/active-org` (regel 23) — voeg hem daar toe i.p.v. een dubbele import als hij ontbreekt.

- [ ] **Step 2: Voeg een auth-helper toe (onder `isWidgetRequest`)**

```ts
// Dual-auth voor het publieke chat-pad. Geldig als óf het V0-demo-cookie klopt
// (ingelogde admin/test/widget-demo paden — geen regressie), óf een geldig
// embed-token + same-origin. Anders 401. Rate-limit draait al ervóór.
function isChatAuthorized(req: Request): boolean {
  const cookie = req.headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE.name}=([^;]+)`))?.[1];
  if (verifyAuthCookieValue(cookie ? decodeURIComponent(cookie) : undefined)) {
    return true;
  }

  // Token moet bij de gevraagde org horen.
  const orgSlug = resolveOrgSlugFromId(getActiveOrgId(req));
  if (!orgSlug) return false;
  const token = req.headers.get('x-chatmanta-embed');
  if (!verifyEmbedToken(token, orgSlug)) return false;

  // Origin-lock: same-origin POST stuurt een Origin die de app-host moet zijn.
  const host = req.headers.get('host');
  const originHdr = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !originHdr) return false;
  try {
    return new URL(originHdr).host === host;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Roep de gate aan na de rate-limit-check**

In `POST`, direct ná het rate-limit-blok (na `if (!rl.allowed) { ... }`, ~regel 123) en vóór `let body: Body;`, toevoegen:

```ts
  if (!isChatAuthorized(req)) {
    const err = new AppError('AUTH_REQUIRED');
    return NextResponse.json(toWire(err, requestId), {
      status: err.status, // 401
      headers: { 'X-Request-Id': requestId },
    });
  }
```

- [ ] **Step 4: Verifieer typecheck + lint**

Run: `npm run typecheck`
Expected: exit 0.
Run: `npm run lint`
Expected: exit 0 (geen ongebruikte imports).

- [ ] **Step 5: Rook-test de gate (curl zonder token → 401)**

Start dev: `npm run dev` (achtergrond). Daarna:

Run: `curl.exe -s -o NUL -w "%{http_code}" -X POST "http://localhost:3000/api/v0/chat?org=acme-corp" -H "Content-Type: application/json" --data "{\"question\":\"hoi\"}"`
Expected: `401`.

- [ ] **Step 6: Commit**

```bash
git add app/api/v0/chat/route.ts
git commit -m "feat(widget-embed): chat-route dual-auth (cookie OF embed-token + origin)"
```

---

## Task 5: ChatMantaWidget — embedded-modus

**Files:**
- Modify: `app/widget/components/chatmanta-widget.tsx` (props-type, signature, fetch-headers, toggle-effect)

- [ ] **Step 1: Breid het props-type uit**

In `ChatMantaWidgetProps` (na `launcherText?: string;`, vóór de sluitende `}`), toevoegen:

```ts
  /** Embedded in een iframe-loader → stuur resize-postMessage naar de parent. */
  embedded?: boolean;
  /** Origin van de parent-loader (voor de postMessage-target). Default '*'. */
  parentOrigin?: string;
  /** Kortlevend embed-token; meegestuurd als x-chatmanta-embed op chat-fetches. */
  embedToken?: string;
```

- [ ] **Step 2: Pak de props in de functiesignatuur**

In de destructuring van `ChatMantaWidget({ ... })`, na `launcherText,` toevoegen:

```ts
  embedded = false,
  parentOrigin = '*',
  embedToken,
```

- [ ] **Step 3: Stuur het token mee in de chat-fetch**

In `send`, bij de `fetch(`/api/v0/chat?org=...`, { headers: { 'Content-Type': 'application/json' } ... })`, vervang het headers-object door:

```ts
          headers: {
            'Content-Type': 'application/json',
            ...(embedToken ? { 'x-chatmanta-embed': embedToken } : {}),
          },
```

En voeg `embedToken` toe aan de `useCallback`-dependency-array van `send` (naast `messages, orgSlug, botVersion, pending`).

- [ ] **Step 4: Post de resize bij open/dicht**

Voeg een effect toe naast de andere `useEffect`-hooks (bijv. na het tooltip-effect):

```ts
  // Embedded-modus: vertel de iframe-loader of we collapsed of open zijn,
  // zodat hij de iframe kan resizen. Side meegestuurd voor de hoek-positie.
  useEffect(() => {
    if (!embedded || typeof window === 'undefined' || window.parent === window) return;
    window.parent.postMessage(
      { type: 'chatmanta:resize', state: open ? 'open' : 'collapsed', side: position },
      parentOrigin,
    );
  }, [embedded, open, position, parentOrigin]);
```

- [ ] **Step 5: Verifieer typecheck**

Run: `npm run typecheck`
Expected: exit 0. Niet-embedded gedrag ongewijzigd (`embedded` default false → effect en header no-op).

- [ ] **Step 6: Commit**

```bash
git add app/widget/components/chatmanta-widget.tsx
git commit -m "feat(widget-embed): ChatMantaWidget embedded-modus (resize + token-header)"
```

---

## Task 6: Ping-endpoint

**Files:**
- Create: `app/api/v0/widget/ping/route.ts`

- [ ] **Step 1: Implementeer de route**

Maak `app/api/v0/widget/ping/route.ts`:

```ts
// Heartbeat-ping uit een geladen embed-iframe. Schrijft lastSeenAt + installOrigin
// zodat de klantendashboard Live-status echte installatie kan tonen.
//
// Auth: identiek aan de chat-route (rate-limit → embed-token + origin-lock).
// Geen LLM, één jsonb-upsert. Antwoordt 204.
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifyAuthCookieValue } from '@/lib/v0/auth-cookie';
import { verifyEmbedToken } from '@/lib/v0/server/embed-token';
import { getActiveOrgId, resolveOrgSlugFromId } from '@/lib/v0/server/active-org';
import { saveWidgetSettings } from '@/lib/v0/klantendashboard/server/settings';
import { getClientIp, getRateLimiter } from '@/lib/v0/server/rate-limit';

export const runtime = 'nodejs';

function authorized(req: Request, orgSlug: string): boolean {
  const cookie = req.headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE.name}=([^;]+)`))?.[1];
  if (verifyAuthCookieValue(cookie ? decodeURIComponent(cookie) : undefined)) return true;

  const token = req.headers.get('x-chatmanta-embed');
  if (!verifyEmbedToken(token, orgSlug)) return false;

  const host = req.headers.get('host');
  const originHdr = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !originHdr) return false;
  try {
    return new URL(originHdr).host === host;
  } catch {
    return false;
  }
}

// Strikte hostname-validatie voor de display-only installOrigin.
function cleanHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const h = raw.trim().slice(0, 255);
  return /^[a-zA-Z0-9.\-:_]+$/.test(h) ? h : null;
}

export async function POST(req: Request) {
  const rl = await getRateLimiter().check(getClientIp(req));
  if (!rl.allowed) return new NextResponse(null, { status: 429 });

  const orgSlug = resolveOrgSlugFromId(getActiveOrgId(req));
  if (!orgSlug || !authorized(req, orgSlug)) {
    return new NextResponse(null, { status: 401 });
  }

  let host: string | null = null;
  try {
    const body = (await req.json()) as { host?: unknown };
    host = cleanHost(body.host);
  } catch {
    // body optioneel — host blijft null
  }

  try {
    await saveWidgetSettings(orgSlug, {
      isInstalled: true,
      lastSeenAt: new Date().toISOString(),
      ...(host ? { installOrigin: host } : {}),
    });
  } catch {
    // best-effort telemetrie; faal de ping niet hard
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Verifieer typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add app/api/v0/widget/ping/route.ts
git commit -m "feat(widget-embed): heartbeat ping-endpoint (token+origin gated)"
```

---

## Task 7: Embed-route `/embed/[slug]`

**Files:**
- Create: `app/embed/[slug]/page.tsx`
- Create: `app/embed/[slug]/embed-client.tsx`

- [ ] **Step 1: Implementeer de client-component**

Maak `app/embed/[slug]/embed-client.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { ChatMantaWidget, type ChatMantaWidgetProps } from '@/app/widget/components/chatmanta-widget';

type Props = ChatMantaWidgetProps & { embedToken: string };

export function EmbedClient(props: Props) {
  // Heartbeat: één ping bij mount. host komt uit ?h= dat de loader meegaf.
  useEffect(() => {
    const host = new URLSearchParams(window.location.search).get('h') ?? undefined;
    void fetch('/api/v0/widget/ping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatmanta-embed': props.embedToken,
      },
      body: JSON.stringify({ host }),
    }).catch(() => {
      // best-effort
    });
  }, [props.embedToken]);

  return <ChatMantaWidget {...props} embedded parentOrigin="*" />;
}
```

- [ ] **Step 2: Implementeer de server-page**

Maak `app/embed/[slug]/page.tsx` (spiegelt de prop-mapping van `app/widget/[slug]/layout.tsx` + `widget-shell.tsx`):

```tsx
// Publieke embed-route: rendert ALLEEN de ChatMantaWidget (geen fake-site chrome),
// op een transparante body. Geladen binnen de iframe van public/widget.js.
import { notFound } from 'next/navigation';

import { LATEST_BOT_VERSION } from '@/lib/v0/server/bots';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import type { OrgSlug } from '@/lib/v0/server/active-org';
import { applyWidgetOverrides, getSkin, ORG_SLUGS_WIDGET } from '@/app/widget/org-skins';
import { createEmbedToken } from '@/lib/v0/server/embed-token';
import { EmbedClient } from './embed-client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

export default async function EmbedPage({ params }: PageProps) {
  const { slug } = await params;
  if (!ORG_SLUGS_WIDGET.includes(slug as (typeof ORG_SLUGS_WIDGET)[number])) {
    notFound();
  }

  const baseSkin = getSkin(slug);
  const orgSettings = await getOrgSettings(slug as OrgSlug);
  const skin = applyWidgetOverrides(baseSkin, {
    starterQuestions: orgSettings.chatbot.starterQuestions,
  });
  const w = orgSettings.widget;
  const token = createEmbedToken(slug);

  return (
    <>
      {/* Transparante body zodat alleen de FAB/het paneel zichtbaar is in de iframe. */}
      <style>{`html,body{background:transparent!important;margin:0;padding:0;overflow:hidden}`}</style>
      <EmbedClient
        embedToken={token}
        orgSlug={skin.slug}
        botVersion={LATEST_BOT_VERSION}
        companyName={skin.companyName}
        primaryColor={skin.primaryColor}
        suggested={skin.suggestedQuestions}
        position={w.position}
        headerTitle={w.title}
        headerSubtitle={w.subtitle}
        isActive={w.isActive}
        logoColor={w.logoColor}
        widgetBgColor={w.widgetBgColor}
        pulseColor={w.pulseColor}
        pulseEnabled={w.pulseEnabled}
        headerColor={w.headerColor}
        logoStyle={w.logoStyle}
        customLogoDataUrl={w.customLogoDataUrl}
        chatbotName={orgSettings.chatbot.chatbotName}
        welcomeMessage={orgSettings.chatbot.welcomeMessage}
        launcherText={w.launcherText}
      />
    </>
  );
}
```

> Verifieer tijdens implementatie dat `applyWidgetOverrides`, `getSkin`, `ORG_SLUGS_WIDGET` exact zo geëxporteerd worden uit `app/widget/org-skins.ts` (zo gebruikt in `app/widget/[slug]/layout.tsx:21`), en dat `LATEST_BOT_VERSION` uit `@/lib/v0/server/bots` komt (layout regel 18). Pas anders het import-pad aan.

- [ ] **Step 3: Verifieer typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/embed/[slug]/page.tsx app/embed/[slug]/embed-client.tsx
git commit -m "feat(widget-embed): publieke /embed/[slug] route + ping-on-load"
```

---

## Task 8: Loader `public/widget.js` + testpagina

**Files:**
- Create: `public/widget.js`
- Create: `public/widget-test.html`

- [ ] **Step 1: Implementeer de loader**

Maak `public/widget.js`:

```js
/* ChatManta embeddable widget loader. Gebruik:
   <script src="https://<host>/widget.js" data-org="acme-corp" defer></script> */
(function () {
  if (window.__chatmantaWidgetLoaded) return;
  window.__chatmantaWidgetLoaded = true;

  var script = document.currentScript;
  if (!script) return;
  var org = script.getAttribute('data-org');
  if (!org) {
    console.warn('[chatmanta] widget.js: ontbrekend data-org attribuut — niets geladen.');
    return;
  }

  // App-origin = waar widget.js vandaan komt. Werkt op localhost en prod.
  var origin = new URL(script.src).origin;
  var host = encodeURIComponent(window.location.hostname || 'onbekend');

  var SIZES = {
    collapsed: { width: '96px', height: '96px' },
    open: { width: 'min(420px, 100vw)', height: 'min(640px, 100dvh)' },
  };

  var iframe = document.createElement('iframe');
  iframe.title = 'Chat';
  iframe.src = origin + '/embed/' + encodeURIComponent(org) + '?h=' + host;
  iframe.setAttribute('allow', '');
  iframe.style.cssText = [
    'position:fixed',
    'bottom:0',
    'right:0',
    'border:0',
    'background:transparent',
    'z-index:2147483000',
    'width:' + SIZES.collapsed.width,
    'height:' + SIZES.collapsed.height,
    'color-scheme:normal',
  ].join(';');
  document.body.appendChild(iframe);

  window.addEventListener('message', function (e) {
    if (e.origin !== origin) return;
    var d = e.data;
    if (!d || d.type !== 'chatmanta:resize') return;
    var size = d.state === 'open' ? SIZES.open : SIZES.collapsed;
    iframe.style.width = size.width;
    iframe.style.height = size.height;
    // Side: links of rechts onderaan.
    if (d.side === 'bottom-left') {
      iframe.style.left = '0';
      iframe.style.right = 'auto';
    } else {
      iframe.style.right = '0';
      iframe.style.left = 'auto';
    }
  });
})();
```

- [ ] **Step 2: Maak een lokale testpagina**

Maak `public/widget-test.html`:

```html
<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <title>ChatManta embed-test</title>
    <meta name="referrer" content="origin-when-cross-origin" />
  </head>
  <body style="font-family: system-ui; padding: 40px; max-width: 640px; margin: 0 auto">
    <h1>Externe testpagina</h1>
    <p>Deze pagina simuleert een klant-website. De widget hoort rechtsonder te verschijnen.</p>
    <!-- Vervang data-org indien gewenst; host = waar je dev-server draait. -->
    <script src="http://localhost:3000/widget.js" data-org="acme-corp" defer></script>
  </body>
</html>
```

- [ ] **Step 3: Verifieer build (statics + routes worden meegebundeld)**

Run: `npm run build`
Expected: exit 0; `/embed/[slug]` verschijnt in de route-lijst; geen metadata-route-collisie.

- [ ] **Step 4: Commit**

```bash
git add public/widget.js public/widget-test.html
git commit -m "feat(widget-embed): widget.js loader + lokale testpagina"
```

---

## Task 9: Klantendashboard — werkende snippet + echte live-status

**Files:**
- Modify: `app/klantendashboard/actions.ts` (nieuwe action)
- Modify: `app/klantendashboard/widget/components/widget-form.tsx` (snippet + live-status)

- [ ] **Step 1: Voeg de check-action toe**

In `app/klantendashboard/actions.ts`, naast de bestaande widget-actions, toevoegen (importeer `getActiveOrgFromCookies` en `getOrgSettings`/`saveWidgetSettings` zoals de andere actions in dit bestand dat doen):

```ts
const WIDGET_INSTALL_FRESHNESS_SEC = Number(process.env.WIDGET_INSTALL_FRESHNESS_SEC) || 604800;

export async function checkWidgetInstallationAction(): Promise<
  ActionResult<{
    isInstalled: boolean;
    lastSeenAt: string | null;
    installOrigin: string | null;
    lastCheckedAt: string;
  }>
> {
  return actionTry(async () => {
    const activeOrg = await getActiveOrgFromCookies();
    const settings = await getOrgSettings(activeOrg.slug);
    const w = settings.widget;
    const seenMs = w.lastSeenAt ? Date.parse(w.lastSeenAt) : NaN;
    const installed =
      Number.isFinite(seenMs) && Date.now() - seenMs < WIDGET_INSTALL_FRESHNESS_SEC * 1000;
    const lastCheckedAt = new Date().toISOString();
    await saveWidgetSettings(activeOrg.slug, { isInstalled: installed, lastCheckedAt });
    revalidatePath('/klantendashboard/widget', 'page');
    return {
      isInstalled: installed,
      lastSeenAt: w.lastSeenAt,
      installOrigin: w.installOrigin,
      lastCheckedAt,
    };
  });
}
```

> Verifieer dat `getActiveOrgFromCookies`, `getOrgSettings`, `saveWidgetSettings`, `actionTry`, `ActionResult`, `revalidatePath` al in dit bestand geïmporteerd zijn (de bestaande `saveWidgetSettingsAction` gebruikt het meeste); voeg ontbrekende imports toe.

- [ ] **Step 2: Bouw de snippet origin-aware**

In `app/klantendashboard/widget/components/widget-form.tsx`: de prop heet nu `workspaceId`. Vervang regel 58:

```ts
  const embedCode = `<script src="https://cdn.chatmanta.nl/widget.js" data-chatbot-id="${workspaceId}"></script>`;
```

door (gebruikt de org-slug + de huidige origin):

```ts
  // origin via window zodat de snippet op localhost én prod het juiste host toont.
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.chatmanta.nl';
  const embedCode = `<script src="${origin}/widget.js" data-org="${orgSlug}" defer></script>`;
```

Wijzig de prop in de `WidgetForm`-signatuur van `workspaceId: string` naar `orgSlug: string`, en in `app/klantendashboard/widget/page.tsx` de call van `workspaceId={KNOWN_ORGS[activeOrg.slug].id}` naar `orgSlug={activeOrg.slug}`.

- [ ] **Step 3: Wire de live-status aan de echte action**

In `widget-form.tsx`, vervang in de "Live-status"-sectie de mock-knop:

```tsx
          <button
            type="button"
            onClick={() =>
              persist({
                lastCheckedAt: new Date().toISOString(),
                isInstalled: true,
              })
            }
            className="klant-btn"
            disabled={pending}
          >
            <RefreshCw size={14} strokeWidth={1.8} /> Installatie testen
          </button>
```

door:

```tsx
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                const res = await checkWidgetInstallationAction();
                if (res.ok) {
                  setW((prev) => ({
                    ...prev,
                    isInstalled: res.isInstalled,
                    lastSeenAt: res.lastSeenAt,
                    installOrigin: res.installOrigin,
                    lastCheckedAt: res.lastCheckedAt,
                  }));
                } else {
                  setError(res.error);
                }
              })
            }
            className="klant-btn"
            disabled={pending}
          >
            <RefreshCw size={14} strokeWidth={1.8} /> Installatie testen
          </button>
```

Voeg `checkWidgetInstallationAction` toe aan de import uit `../../actions`. Voeg in het `StatusCell`-grid een extra cel toe wanneer `w.installOrigin` aanwezig is:

```tsx
          {w.installOrigin && (
            <StatusCell label="Gezien op" value={w.installOrigin} tone="neutral" />
          )}
```

- [ ] **Step 4: Verifieer typecheck + lint**

Run: `npm run typecheck`
Expected: exit 0.
Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/klantendashboard/actions.ts app/klantendashboard/widget/components/widget-form.tsx app/klantendashboard/widget/page.tsx
git commit -m "feat(widget-embed): werkende origin-aware snippet + echte installatie-status"
```

---

## Task 10: Integratie-verificatie (build + handmatige acceptatie)

**Files:** geen (verificatie). Optioneel: `tests/v0/widget-embed.spec.ts`.

- [ ] **Step 1: Volledige gates groen**

Run: `npm run typecheck`
Expected: exit 0.
Run: `npm run lint`
Expected: exit 0.
Run: `npm run build`
Expected: exit 0; `/embed/[slug]`, `/api/v0/chat`, `/api/v0/widget/ping` in de output.

- [ ] **Step 2: Handmatige acceptatie — embeddability (kerndoel)**

1. `npm run dev` (laat draaien).
2. Open een **incognito**-venster (géén demo-cookie) op `http://localhost:3000/widget-test.html`.
3. Verwacht: FAB rechtsonder verschijnt; klik → paneel opent (iframe groeit); stel een vraag → streaming antwoord, gescoped op `acme-corp` (Dakwerken De Boer).
4. Verwacht negatief: `curl.exe -s -o NUL -w "%{http_code}" -X POST "http://localhost:3000/api/v0/chat?org=acme-corp" -H "Content-Type: application/json" --data "{\"question\":\"hoi\"}"` → `401`.

- [ ] **Step 3: Handmatige acceptatie — installatie-detectie**

1. Met `widget-test.html` nog open in incognito (de embed heeft net gepingd).
2. Log in op de demo in een normaal venster → ga naar `/klantendashboard/widget` (org = acme-corp).
3. Klik "Installatie testen". Verwacht: "Gevonden op website: Ja", "Gezien op: localhost", verse "Laatste check".
4. Verwacht negatief: `curl.exe -s -o NUL -w "%{http_code}" -X POST "http://localhost:3000/api/v0/widget/ping" -H "Content-Type: application/json" --data "{}"` → `401`.

- [ ] **Step 4: Regressie — ingelogde paden ongemoeid**

1. Open ingelogd `http://localhost:3000/widget/acme-corp/<eerste-pagina>` → widget-chat werkt nog (cookie-pad).
2. Klantendashboard `/klantendashboard/test` testtool werkt nog.

- [ ] **Step 5 (optioneel): Playwright e2e**

Als geautomatiseerde dekking gewenst is, maak `tests/v0/widget-embed.spec.ts` die (a) `/embed/acme-corp` laadt en de FAB-knop assert, en (b) `POST /api/v0/chat?org=acme-corp` zonder token → 401 assert. Run: `npm run test:e2e -- widget-embed`.

- [ ] **Step 6: Klaar voor PR**

Geen losse commit nodig (verificatie). Ga door naar de PR-flow: vul `.github/pull_request_template.md`, run `graphify update .`, en open de PR met `gh pr create`.

---

## Self-Review (uitgevoerd)

- **Spec-dekking:** §3 iframe-flow → Tasks 6/7/8. §4.1 loader → Task 8. §4.2 embed-route → Task 7. §4.3 widget-props → Task 5. §4.4 proxy → Task 3. §4.5 token → Task 1. §4.6 chat dual-auth → Task 4. §4.7 snippet → Task 9. §4.8 ping + types → Tasks 2/6/7. §4.9 live-status → Task 9. §5 security → Tasks 1/3/4/6. §6 env → Tasks 0/1/9. §8 testplan → Task 10. Geen open gaten.
- **Placeholders:** geen TBD/TODO; alle code-stappen bevatten volledige code.
- **Type-consistentie:** `createEmbedToken`/`verifyEmbedToken` (Task 1) identiek gebruikt in Tasks 4/6/7. `lastSeenAt`/`installOrigin` (Task 2) identiek in Tasks 6/9. `embedded`/`parentOrigin`/`embedToken` (Task 5) identiek in Task 7. `checkWidgetInstallationAction` returnshape (Task 9 step 1) matcht het gebruik in step 3. PostMessage-contract `{type:'chatmanta:resize', state, side}` identiek in Task 5 (zender) en Task 8 (ontvanger).
