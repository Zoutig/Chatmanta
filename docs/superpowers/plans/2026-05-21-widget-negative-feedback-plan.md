# Widget negative feedback — implementation plan

**Spec:** `docs/superpowers/specs/2026-05-21-widget-negative-feedback-design.md`
**Branch:** `feat/seb/widget-feedback`
**Worktree:** `C:\Users\solys\Documents\Code\chatmanta-widget-feedback`

Each task = one logical commit. Run `npm run typecheck` after every backend task; cache-clear (`rm -rf .next`) before manual widget verification.

## Task 1 — DB migration `0030_v0_feedback` + types

- **Files:** `supabase/migrations/0030_v0_feedback.sql` (new); `lib/v0/klantendashboard/types.ts` (additive)
- **Approach:** Schrijf migration zoals in spec. Run `npm run migrate` om hem live te zetten. Voeg `NegativeFeedbackItem` type toe aan types.ts voor de dashboard-view (id, queryLogId, threadId|null, rating, comment, createdAt, question, answer, kind).
- **Tests:** `npm run migrate:status` — laat zien dat 0030 applied is. `psql … "SELECT * FROM v0_feedback LIMIT 1"` via supabase studio of `npm run v0:list` adhoc.
- **Commit:** `feat(db): 0030 v0_feedback table + RLS`

## Task 2 — queryLogId meta-event + logQuery overrideId

- **Files:** `lib/v0/server/log.ts`; `app/api/v0/chat/route.ts`
- **Approach:**
  1. In `logQuery` (en `logBlockedQuery` als we die ook willen voorzien — spec zegt alleen logQuery, dus skip blocked) — accepteer optioneel `overrideId?: string`. Als gegeven, gebruik die als `id` bij insert; anders default (`gen_random_uuid()`-server-side).
  2. In `chat/route.ts`: vóór de stream-start, `const queryLogId = crypto.randomUUID()`. Zet hem in een NDJSON-event `{ kind: 'meta', queryLogId, requestId }` als eerste enqueued event in de `start` van de ReadableStream. Pass `queryLogId` mee aan `logQuery` als `overrideId`.
  3. Smalltalk / fallback / blocked: meta-event ook sturen — widget moet feedback op smalltalk en fallback óók toelaten per spec edge case.
  4. Voor blocked-query branch (injection): die heeft geen logQuery → geen queryLogId nodig in dat antwoord. Geen feedback mogelijk op blocked-message. Widget gate: meta-event = required vóór thumbs enabled.
- **Tests:** Manuele curl: `curl -N POST /api/v0/chat ...` → verifieer dat eerste event `{ "kind": "meta", ... }` is. `npm run typecheck`.
- **Commit:** `feat(api/v0/chat): stream queryLogId meta-event for feedback coupling`

## Task 3 — POST /api/v0/feedback

- **Files:** `app/api/v0/feedback/route.ts` (new)
- **Approach:**
  1. POST handler met body `{ queryLogId: string, rating: 'up'|'down', comment?: string|null }`. Hergebruik `newRequestId()`, `getClientIp`, rate-limiter (`rl.check` zelfde bucket — feedback is goedkoop, hoeft geen aparte limit).
  2. Resolve `organizationId = getActiveOrgId(req)`.
  3. Verify query_log-row: `SELECT id, organization_id, thread_id_if_we_track_it FROM query_log WHERE id = $1 AND organization_id = $2`. Tip: query_log heeft géén thread_id kolom — feedback.thread_id blijft NULL voor widget-source. Voor admintool-source kunnen we later iets bouwen (out of scope).
  4. Cap `comment` op 2000 chars (substring).
  5. Insert into v0_feedback. Op UNIQUE-conflict (`unique(query_log_id, rating)`): return 200 met `{ ok: true, idempotent: true }`. Anders 201 met `{ ok: true }`.
  6. Foutpaden: 401 als geen org-cookie, 400 als invalid body, 404 als query_log-row niet bestaat in deze org, 429 op rate-limit.
- **Tests:** `curl POST /api/v0/feedback`-handmatig. `npm run typecheck`.
- **Commit:** `feat(api/v0/feedback): POST endpoint voor 👍/👎 + optionele toelichting`

## Task 4 — Widget feedback UI

- **Files:** `app/widget/components/feedback-buttons.tsx` (new); `app/widget/components/chatmanta-widget.tsx` (touch BotBubble + Message type + handleEvent voor meta)
- **Approach:**
  1. Extend `Message` (assistant variant): `queryLogId?: string`, `feedbackState?: 'idle' | 'comment-open' | 'submitting' | 'sent-down' | 'sent-up' | 'error'`, `feedbackComment?: string`. User variant ongewijzigd.
  2. In `handleEvent`: nieuwe branch voor `e.kind === 'meta'` → `updateAssistant(setMessages, assistantId, { queryLogId: (e as { queryLogId: string }).queryLogId })`.
  3. Nieuwe component `FeedbackButtons`: props `{ queryLogId: string|undefined, state, comment, onChange(comment), onSubmit(rating: 'up'|'down', comment?: string), onCancel() }`. UI: twee subtiele 12px icoontjes (lucide ThumbsUp/ThumbsDown), grijs-default, hover-fade. Bij `state === 'comment-open'`: textarea (3 regels, max 2000 chars) + "Verstuur" + "Sla over"-knoppen. `state === 'sent-down'`: ThumbsDown-filled, beide disabled. `state === 'sent-up'`: ThumbsUp-filled, beide disabled.
  4. In `BotBubble` (of `ChatMantaWidget` map-loop): voeg `<FeedbackButtons>` toe onder de bubble-content alleen als `m.role === 'assistant' && !m.streaming && !m.error && m.queryLogId`. **Geen** voor welkomstbubble (welkomst zit niet in `messages`-array — die wordt los gerenderd).
  5. Submit-handler: client-side fetch naar `/api/v0/feedback` met `{ queryLogId, rating, comment }`. Op success: `feedbackState = 'sent-down' | 'sent-up'`. Op fail: `feedbackState = 'error'` + retry-mogelijkheid (klik 👎 nog eens).
  6. Cache-clear nodig: na widget-edits `rm -rf .next` + dev-server restart vóór browser-check.
- **Tests:** Open `/widget/akka` (of een KNOWN_ORG slug), stel vraag, wacht op antwoord, klik 👎, type wat, verstuur, check DB `SELECT * FROM v0_feedback ORDER BY created_at DESC LIMIT 5`. Daarna 👍 op een andere vraag. Edge case: klik 👎 → "Sla over" → check DB voor row met `comment IS NULL`.
- **Commit:** `feat(widget): 👍/👎 feedback per bot-antwoord + optionele toelichting`

## Task 5 — Dashboard server wrapper + tabel

- **Files:** `lib/v0/klantendashboard/server/feedback.ts` (new); `app/klantendashboard/gesprekken/components/negative-feedback-table.tsx` (new)
- **Approach:**
  1. `listNegativeFeedback(orgSlug, sinceDays = 30)`: SELECT feedback + JOIN query_log → return `NegativeFeedbackItem[]`. Filter `rating = 'down'`. Order by created_at desc. Limit 100. Bij JOIN-fail of empty: lege array.
  2. Tabel-component: 4 kolommen (Vraag · Toelichting · Bot-antwoord · Tijd) met inline-expand-rij voor detail (vraag, volledig antwoord, bronnen via `query_log.answer` + we slaan sources niet op in query_log → check schema; misschien hebben we wel `query_log.sources` of niet — als niet, alleen vraag+antwoord tonen, sources weglaten). Comment toon met `whiteSpace: 'pre-wrap'`; truncate met `display: -webkit-box, line-clamp:2`. Toelichting-kolom toont '(geen toelichting)' als `comment === null`.
  3. `count(*) where rating='down' and created_at > now() - 7d` → return als deel van listNegativeFeedback om de banner-trigger te berekenen.
- **Tests:** Open `/klantendashboard/gesprekken?filter=negative_feedback` na een paar 👎 in widget. Verifieer dat alle rows zichtbaar zijn met juiste data. `npm run typecheck`.
- **Commit:** `feat(klantendashboard): negative-feedback tabel + server-wrapper`

## Task 6 — Wire filter-branch + banner in gesprekken page

- **Files:** `app/klantendashboard/gesprekken/page.tsx`
- **Approach:**
  1. Op page-load: ook `listNegativeFeedback(activeOrg.slug)` aanroepen (parallel met andere calls). Tellen → `negativeCount` (laatste 7d).
  2. Render-branch: wanneer `filter === 'negative_feedback'` → render `<NegativeFeedbackTable items={feedback} />` ipv de threads-tabel. Empty-state-component blijft hergebruikt.
  3. Banner bovenaan bij `view === 'gesprekken' && filter !== 'negative_feedback'`: als `negativeCount > 0`: subtiel rood/warn-banner "{N} bezoeker(s) gaven negatieve feedback in de laatste 7 dagen. [Bekijk]".
  4. Conversations.ts mag z'n `negative_feedback`-stub kwijt — verwijder die branch want we routen op page-level naar de andere tabel.
- **Tests:** Filter switching werkt, banner toont bij ≥1 row, verdwijnt bij 0.
- **Commit:** `feat(klantendashboard): wire negative-feedback filter + dashboard banner`

## Task 7 — Verify + PR + cleanup

- **Files:** none (workflow only)
- **Approach:** `npm run typecheck && npm run lint`. Playwright manual walkthrough: open widget op `/widget/akka`, doe 3 vragen, klik 👍 op 1, 👎+comment op 2, 👎-skip op 3, ga naar `/klantendashboard/gesprekken?filter=negative_feedback`, verifieer 2 rows + comment + 1 zonder. Screenshots naar `qa-feedback-*.png`. Daarna `gh pr create` met template ingevuld.
- **Commit:** geen (afsluitende stap)

## Risico's / aandachtspunten

- **Cache-issue**: na widget-edits eerst `rm -rf .next` voordat ik conclusies trek over "het werkt niet". Memory waarschuwt hier expliciet voor.
- **Multi-tab race**: bezoeker opent widget in twee tabs, krijgt twee `queryLogId`s voor hetzelfde vraag-antwoord-paar bij submit van 👎 in elk tab. Geen collisie omdat het twee aparte log-rows zijn — gewenst gedrag.
- **Smalltalk feedback**: smalltalk-events bevatten ook een geldige queryLogId (logQuery loopt). Spec accepteert feedback op smalltalk. Geen extra werk.
- **Filter-stub verwijderen in conversations.ts**: zorg dat de `negative_feedback`-tak die nu `items = []` terugzet, weg is — anders krijg je dubbele/lege rendering.
- **CSS / Tailwind v4 quirk**: feedback-buttons inline-style, niet via globals.css. Memory waarschuwt voor PostCSS drops.
