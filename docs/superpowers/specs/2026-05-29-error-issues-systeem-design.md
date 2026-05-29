# SPEC — Centraal fout-/errorsysteem + "Copy for Claude Code" (Issues-tab)

**Datum:** 2026-05-29 · **Branch:** `feat/seb/error-issues-systeem` · **Scope:** V0 · **Migratie:** 0039
**Herkomst:** approved plan (`cozy-riding-comet.md`) → big-ship design-toernooi (winner = risk-first, grafts uit mvp-first + architecture-first).

## Wat & waarom (in mensentaal)

ChatManta heeft een sterk error-*framework* (`lib/errors/`: `actionTry`, `AppError`, 14 codes,
`requestId`, NL user-messages) maar **geen error-*opslag***. Zodra een fout geclassificeerd is,
verdwijnt hij naar de response + `console`. De Issues-tab is vandaag een *live afleiding*, geen log.
Daardoor verdwijnt onzichtbaar: server-action-fouten in prod, rate-limit/auth/parse-rejecties,
stream-exceptions in de chat, `logQuery`/`commitTurn`-faals, en **elke** widget client-crash.

**Doel:** een persistente, doorzoekbare fout-store + capture over Widget / Klantendashboard /
Chatbot, zichtbaar in de AdminDashboard Issues-tab, met één knop **"Kopieer voor Claude Code"** die
de volledige context (stack, file:line, org, requestId, geredigeerde input, commit) als plak-klaar
markdown kopieert. Plus een positief "alles draait"-signaal.

## Vastliggende beslissingen

| # | Beslissing | Keuze |
|---|---|---|
| 1 | Capture-laag | Server **+** client → publiek ingest-endpoint nodig |
| 2 | Wat loggen | **Alles**, severity-getagd (error/warning/info) |
| 3 | Volume | **Fingerprint-grouping** + count (Sentry-stijl, géén per-event-tabel) |
| 4 | User-input | **Bewaren, PII-geredigeerd** (server-side, niet-omzeilbaar) |
| 5 | Origin-policy (publiek endpoint) | **Fail-open + downgrade naar `info`** bij verdachte origin |
| 6 | Verwachte faals (rate-limit/auth/invalid/injection) | severity=**`info`** → standaard verborgen uit de error+warning-view |
| 7 | Sink-seam | **Ja, lichtgewicht** (`lib/observability/sink.ts`, expliciete boot-registratie) |

## Geverifieerde correcties op het approved plan (gecheckt tegen de worktree)

1. **`lib/controlroom/pii.ts` REDIGEERT niet** — het exporteert alleen `detectPossiblePii()` (boolean).
   → nieuwe pure `redactPii(text)` in `lib/observability/redact.ts`, hergebruikt dezelfde
   EMAIL/IBAN/BSN/PHONE-regexes, maskeert spans naar `[email]`/`[telefoon]`/`[iban]`/`[bsn]`.
2. **`proxy.ts` password-gate-exemptie** is een vereiste wiring-stap — de negative-lookahead matcher
   (`api/v0/chat|feedback|widget`) moet `client-error` erbij krijgen, anders is het endpoint
   onbereikbaar voor de live widget.
3. Redactie gated op de bestaande **`admin_privacy_settings.pii_redaction_enabled`** (default true).
4. **Cardinaliteits-cap** (~5000 open groepen) — fingerprint-grouping alleen wordt verslagen door
   een fuzzer met unieke-per-event messages; overflow → één bucket.
5. **Server-compute** fingerprint/surface/severity; client-velden worden genegeerd (publiek endpoint).
6. **`count++` via één `INSERT..ON CONFLICT DO UPDATE` is al atomair** → géén `SECURITY DEFINER` RPC.
7. **Severity-vocab**: tabel = `error|warning|info`; bestaande `buildIssues()` = `critical|warning|info`
   → map `critical→error` in de afgeleide sectie.

## Architectuur

```
lib/errors/action.ts ─┐
chat/feedback routes ─┤→ getSink().capture(event)  [interface, géén admin-import]
client-error endpoint ┘            │ expliciete boot-registratie (instrumentation)
                                   ▼
              lib/v0/server/error-capture.ts  (DB-sink, fire-and-forget, never-throws,
                                   │           after()+timeout, reentrancy-guard)
                                   ▼ INSERT..ON CONFLICT(fingerprint) DO UPDATE count++
                          admin_error_groups (0039)
                                   │
            lib/controlroom/server/errors.ts (read + status-mutatie, sb() service-role)
                                   │
   Issues-tab (health-strip + gelogde fouten + afgeleide signalen) + /issues/[groupId] (Copy)
                                   │ recentCriticalErrorCount → OrgSignals → deriveHealth()
```

### Datamodel — `0039_admin_error_groups.sql`
Volgt het 0038 `admin_*`-precedent: **geen RLS**, `organization_id` plain nullable uuid (geen FK,
KNOWN_ORGS-gevalideerd in de writer), hergebruik bestaande `admin_touch_updated_at()`-trigger.

```
id uuid pk default gen_random_uuid()
fingerprint text not null unique            -- sha256(surface|code|normTopFrame|route), SERVER-computed
organization_id uuid null
surface text check (widget,dashboard,chatbot,api,cron,system)
severity text check (error,warning,info)
code text                                   -- AppErrorCode | 'CLIENT_JS' | 'UNKNOWN'
title text not null
message text
count integer not null default 1
first_seen_at / last_seen_at timestamptz default now()
status text check (open,resolved,ignored) default 'open'
resolved_at timestamptz
last_context jsonb                          -- {requestId,stack(cap~4KB/30frames),topFrame,url,method,
                                            --  route,botVersion,threadId,inputRedacted,userAgentHash,
                                            --  breadcrumbs?(deferred),commit,env,originSuspect?}
created_at / updated_at timestamptz
```
Indexes: `unique(fingerprint)`; partial `(status,severity,last_seen_at desc) where status='open'`;
`(organization_id, last_seen_at desc)`. Upsert: `count=count+1, last_seen_at=now(),
last_context=excluded, status = case when status='resolved' then 'open' else status end`
('ignored' blijft 'ignored').

### Severity-map (beslissing #2 + #6)
- **error**: `INTERNAL`, `LLM_TIMEOUT`, `LLM_UNAVAILABLE`, `EMBED_FAILED`, `CRAWL_FAILED`,
  `INGEST_READ_FAILED`, `CLIENT_JS` (widget/dashboard crashes), `UNKNOWN`.
- **warning**: telemetrie-verlies (`logQuery`/`commitTurn`/`logBlockedQuery`-faals), `INGEST_TOO_LARGE`,
  `INGEST_TYPE`, `NOT_FOUND`.
- **info** (verborgen uit default-view): `RATE_LIMIT`, `AUTH_REQUIRED`, `AUTH_FORBIDDEN`,
  `INPUT_INVALID`, `INJECTION_BLOCKED`, fallback.
- Default Issues-view = `severity in (error,warning) AND status='open'`.

### Capture-laag
- `lib/observability/sink.ts` — `type ErrorEvent` (Sentry-superset) + `interface ErrorSink` +
  `registerSink()/getSink()` (default no-op). `lib/errors` + routes hangen alléén hiervan af.
  Eslint `no-restricted-imports` verbiedt controlroom/error-capture-import vanuit `lib/errors/**`.
- `lib/observability/fingerprint.ts` — pure `computeFingerprint()` + `normalize()` (strip
  `chm_`-ids/uuids/hex/digit-runs/quoted-strings). `lib/observability/redact.ts` — pure `redactPii()`.
  `lib/observability/claude-payload.ts` — pure `buildClaudePayload(group) → markdown`.
- `lib/v0/server/error-capture.ts` — `captureError(partial): void`, fire-and-forget, never-throws,
  `after()` + `Promise.race(~800ms)` + reentrancy-guard, schrijft via controlroom `sb()`. Self-bouwt
  ErrorEvent, redigeert input, upsert. Registreert zich expliciet bij boot (instrumentation/route).

### Publiek endpoint — `app/api/v0/client-error/route.ts` (nodejs, POST)
Volgorde: (1) rate-limit FIRST (dedicated bucket `~20/min/IP` + per-org) → (2) body-cap (~8-16KB,
Content-Length + bounded read) → (3) JSON-guard → (4) **server-side redact** (niet-omzeilbaar, gated
op `pii_redaction_enabled`) → (5) **server-resolve org** tegen KNOWN_ORGS (onbekend → NULL) →
(6) **server-compute** fingerprint/surface → (7) origin: aanwezig+mismatch → severity forced `info` +
`originSuspect=true` (fail-open) → (8) **altijd 204** No Content, geen body. Body: `{surface:'widget'
|'dashboard', message, stack?, url?, code?, digest?, userAgent?(server-gehashed)}`.

### Client-reporters
- `lib/widget/report-client-error.ts` — `navigator.sendBeacon` → endpoint, geen await, eigen
  `chm_`-id client-side. Widget: error boundary (bestaat nu NIET) + `window.onerror`/
  `unhandledrejection` binnen het iframe.
- Dashboard: `app/error.tsx` (bestaat, console-only) + reporter; `app/global-error.tsx` indien afwezig.

### Issues-tab + detail + Copy-for-Claude
- `app/admindashboard/issues/page.tsx` — drie blokken: **health-strip** (deriveHealth gevoed met
  `recentCriticalErrorCount`), **Gelogde fouten** (persistent log, default error+warning+open, filters
  via RSC-searchParams `?severity=&surface=&org=&status=`), **Afgeleide signalen** (bestaande
  `buildIssues()`, behouden). Lege-staat van de log = "Geen gelogde fouten — alles draait" = het
  gezonde signaal.
- `app/admindashboard/issues/[groupId]/page.tsx` — volledige `last_context` + count + first/last +
  `CopyButton` (hergebruik) met server-gebouwde markdown via `buildClaudePayload` + resolve/ignore
  acties (`app/actions/controlroom.ts`, `requireV0Auth()` + KNOWN_ORGS-validatie).
- Copy-payload: fenced `## ChatManta error — {code} ({surface})`, key:value-tabel (org/severity/count/
  first-last/commit/env/requestId/route/method), `### Stack` fence (geredigeerd, file:line zichtbaar),
  `### Input (PII-geredigeerd)`, repro-hint. Volledig uit `last_context` (al geredigeerd) → Copy kan
  nooit rauwe PII lekken.

### Health-integratie + retention
- `recentCriticalErrorCount` (open, severity=error, <24u) additief in `OrgSignals`; `deriveHealth`
  blijft puur (default 0 = geen gedragswijziging bestaande callers).
- Retention: breid bestaande `lib/controlroom/server/retention.ts` uit (prune `status!='open' AND
  last_seen_at < now()-issue_retention_days`, `admin_privacy_settings.issue_retention_days` default 90,
  + age-cap op open low-severity).

## Acceptatiecriteria (onafhankelijk toetsbaar)

1. Twee identieke fouten → **één** rij, `count=2`; nieuwe fout op `resolved`-groep → her-opent;
   `ignored` blijft `ignored`.
2. `redactPii()` maskeert email/telefoon/IBAN/BSN in een sample; unit-getest.
3. Server-action-throw → exact één `error`-rij surface=`dashboard`; rate-limit op `/api/v0/chat` →
   één `info`-rij (verborgen uit default-view); succesvolle chat → nul rijen.
4. Geen extra latency op happy-path (stream sluit direct; capture in `after()`).
5. Publiek endpoint: dashboard-throw + geforceerde widget-crash → rijen surface=`dashboard`/`widget`
   met PII-geredigeerde message; 1MB-body en garbage-JSON → 204 + nul rijen; antwoord altijd 204.
6. Issues-tab toont default error+warning+open, count-badges kloppen; detail opent; **Copy-for-Claude**
   levert plak-klaar markdown met stack+requestId+org+commit+geredigeerde input; resolve/ignore haalt
   de rij uit de default-view.
7. Org met recente critical → oranje/rood in de health-strip + op de klantenlijst.
8. `npm run migrate` clean; `Remove-Item .next` → `next build` clean op Windows.

## Out-of-scope (bewust NIET in deze v1)
- Per-event/occurrence-historie-tabel (alleen `count` + first/last + last-context-wins).
- Breadcrumb-buffer (veld blijft in jsonb-shape voor V1, geen wiring).
- Sentry/externe APM (homegrown; een Sentry-DSN zou `NEXT_PUBLIC` op de live widget zijn → hard-rule).
- Realtime alerting (Resend e-mail op critical) → latere Phase-7-hardening.
- Trend-grafieken/sparklines, RLS (admin_* precedent), `SECURITY DEFINER` RPC.

## Edge cases
- Logger-recursie: `captureError`-eigen faals → alleen `console.error`, nooit re-capture (guard-flag).
- Fingerprint-explosie → normalisatie + harde groep-cap (overflow-bucket).
- Cold-start: sink expliciet geregistreerd (geen self-register-at-import dat tree-shaking overslaat).
- `organization_id` spoofbaar via `?org=` (V0-disclaimer) → alleen KNOWN_ORGS-uuid, geen tenant-lek;
  `originSuspect`-tag zichtbaar voor de operator.

## Hard-rule-compliance
V1 Minimal Scope (één tabel, geen per-event/Sentry/alerting) · admin_*-precedent (geen RLS, plain
uuid, KNOWN_ORGS-validatie) · SA-5 service-role via `sb()`/wrappers (geen losse `supabaseAdmin`) ·
geen secrets in `NEXT_PUBLIC_*` · anti-hallucinatie/cost: fire-and-forget, rate-limited, body-capped,
geen LLM/embeddings in het ingest-pad · AVG: niet-omzeilbare server-side redactie aan beide
trust-boundaries · Tailwind v4: inline-style + bestaande `klant-*`-classes · Windows: schone `.next`.
