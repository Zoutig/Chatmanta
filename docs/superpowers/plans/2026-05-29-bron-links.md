# Plan — Echte bron-links in bot-antwoorden

_Spec: `docs/superpowers/specs/2026-05-29-bron-links-design.md` · Migratie: 0042 ·
Branch: `feat/seb/bronlinks`_

## Architectuur-keuzes (waarom zo)

- **Direct op v0.9.1 (besluit Sebastiaan, 2026-05-29).** GEEN nieuwe bot-versie:
  `sourceLinksEnabled: true` wordt op de bestaande v0.9.1 gezet, en geldt voor
  toekomstige versies (die spreaden van de laatste config → erven de flag).
  Bewuste afwijking van de append-only conventie. v0.9.1 blijft LATEST → de live
  widget pikt de fix automatisch op.
- **Prompt-addon gated op URL-aanwezigheid.** De "link alleen naar gegeven
  URLs"-instructie + de `Bron-URL`-regels verschijnen alléén als er minstens één
  website-chunk mét URL in de context zit. De DEV_ORG eval-set is document-based
  (geen `website_url`) → de eval-prompt blijft byte-identiek → geen regressie.
- **Anti-hallucinatie = server-side sanitizer (de harde garantie).** Niet
  vertrouwen op prompt-gehoorzaamheid: een sanitizer strijkt elke link waarvan de
  URL niet in de aangeleverde set zit terug naar platte tekst. Renderers blijven
  daardoor "dom" (renderen elke veilige http(s)-link) — de waarheid zit in de
  geschoonde answer-tekst.
- **Renderers version-agnostisch.** Link-rendering is pure UI-verbetering, geldt
  voor alle versies; veilig want oude versies krijgen geen URLs aangereikt.

## Task 1: Migratie 0042 — RPCs geven source_url + source_title terug
- Files: `supabase/migrations/0042_v0_source_links.sql`
- Approach: drop+recreate `match_chunks_with_parents` én `match_chunks_hybrid`
  met twee extra RETURNS-kolommen `source_url text`, `source_title text`,
  geselecteerd uit de al-bestaande `left join website_pages wp` (`wp.url`,
  `wp.title`; NULL voor document-chunks). Alle bestaande kolommen, filters
  (`included`, `deleted_at`, org-isolatie) en `security invoker` ongewijzigd.
  Daarna `npm run migrate`.
- Tests: `npm run migrate:status` toont 0042 applied; geen drift.

## Task 2: URL door de retrieval-types heen rijgen
- Files: `lib/v0/server/rag.ts` (`RawChunk` type; hybrid `hydrated`-map)
- Approach: `website_url?: string | null` + `website_title?: string | null` aan
  `RawChunk`. `retrieveChunks` spreidt `...c` al → velden stromen mee;
  `HybridRow = RawChunk & …` bevat ze ook via `...c`. Verifiëren dat beide
  RPC-paden de velden dragen.
- Tests: `npm run typecheck`.

## Task 3: Bot-flag op v0.9.1 (en vooruit)
- Files: `lib/v0/server/bots.ts`
- Approach: optioneel `sourceLinksEnabled?: boolean` op `BotConfig` met
  doc-comment "standaard AAN vanaf v0.9.1; nieuwe versies houden dit aan".
  `sourceLinksEnabled: true` zetten op V0_9_1. Geen nieuwe versie, LATEST
  ongewijzigd. Toekomstige versies erven via de bestaande spread-idioom.
- Tests: typecheck; `resolveBot('v0.9.1').sourceLinksEnabled === true`;
  `LATEST_BOT_VERSION === 'v0.9.1'` (ongewijzigd).

## Task 4: Echte URLs aan het model voeren + "verzin nooit"-regel
- Files: `lib/v0/server/rag.ts` (beide context-builders ~1289 & ~2167 + user-prompt)
- Approach: bij `bot.sourceLinksEnabled` voeg per website-chunk met `website_url`
  een regel `Bron-URL: <website_title? + " — "><url>` toe aan zijn context-blok,
  en verzamel de set aangeleverde URLs. Voeg (alleen als ≥1 URL aanwezig) een
  `sourceLinksIntro` toe aan de user-prompt: _"Je mag relevante bronpagina's als
  markdown-link `[tekst](url)` opnemen, maar UITSLUITEND met exact de hierboven
  gegeven Bron-URLs. Verzin nooit een URL of pad. Geen Bron-URL beschikbaar →
  verwijs in woorden, zonder link."_ Gating op URL-aanwezigheid houdt DEV_ORG
  eval byte-identiek.
- Tests: unit/inspectie — prompt bevat URLs + regel bij enabled+URLs; afwezig
  zonder URLs of zonder flag.

## Task 5: Output-sanitizer — niet-aangeleverde link-URLs droppen
- Files: `lib/v0/server/source-links.ts` (nieuw) + wiring in `rag.ts` + unit-test
- Approach: `sanitizeSourceLinks(text, allowedUrls: Set<string>): string` —
  match `[label](url)`; normaliseer url (trim, lowercase host, strip trailing
  slash); url ∉ allowed OF niet-http(s) → vervang door `label` (link weg, tekst
  blijft). Bouw `allowedUrls` uit `final.slice(0,used)` `website_url`. Toepassen
  op (a) `finalAnswerText` na cascade/parse, (b) geregenereerde `activeAnswerText`,
  (c) eval-pad `runRagQuery` answer. Alleen actief bij `bot.sourceLinksEnabled`
  (anders identity → oude versies ongemoeid).
- Tests: unit — allowed blijft, verzonnen → label, trailing-slash matcht,
  `javascript:`/`mailto:` → label, tekst-zonder-links ongewijzigd.

## Task 6: Widget-renderer link-aware
- Files: `lib/widget/render-markdown-lite.tsx` + `tests/widget/render-markdown-lite.test.tsx`
- Approach: inline-parser uitbreiden met `[tekst](url)` → veilige `<a>`
  (http/https, `target=_blank`, `rel="noopener noreferrer"`); niet-http → platte
  label-tekst. Bold/bullets/cleaner intact; citatie-strip (`[\d+]`) en
  trailing-tag-strip ongemoeid.
- Tests: bestaande testfile uitbreiden — anchor bij http(s), `javascript:` →
  tekst, bold+link samen, citatie naast link.

## Task 7: Dashboard-renderer link-aware
- Files: `app/components/messages.tsx` (`RichText`)
- Approach: `[tekst](url)`-parsing toevoegen naast `**bold**`/`` `code` ``.
  http(s)-only veilige `<a>`. `CitedText` splitst numerieke `[n]` eerst (links
  hebben niet-numerieke labels → geen botsing); bekende edge: puur-numeriek
  label `[2024](url)` — geaccepteerde randgeval.
- Tests: browser-verificatie (gate 5c); evt. kleine unit als component-testsetup
  bestaat.

## Task 8: Demo/embed gebruikt v0.9.1 verifiëren
- Files: mogelijk geen (als widget → LATEST=v0.9.1 resolvet) of een pin/default
- Approach: nagaan hoe de embed/widget de `botVersion` voor de demo-org bepaalt;
  bevestigen dat die v0.9.1 gebruikt (of LATEST → v0.9.1). Pint hij een oudere
  versie zonder de flag → pin bijwerken naar v0.9.1.
- Tests: browser-verificatie op de embed (gate 5c) — vraag "vertel me meer over
  het bedrijf" geeft klikbare, kloppende links (geen 404-gok, geen rauwe markdown).

## Volgorde & commits
1 → 2 → 3 → 4 → 5 (engine, sequentieel) → 6, 7 (renderers, los) → 8 (verify/pin).
Eén commit per task, `<type>(<scope>): <imperatief>` in het Nederlands.
Typecheck + relevante tests na elke task.

## Gates (uit ship-feature)
- 5a Codex-review-loop, 5b schone `next build` (eerst `.next` wissen).
- 5c browser (dashboard test-chat + embed), licht/donker + mobiel.
- 5d eval: `lib/v0/` wijzigt → cheap hard-eval (of `eval:run-all`); verwacht
  v0.9.1-score ONGEWIJZIGD t.o.v. baseline — op DEV_ORG (geen website-URLs) is
  zowel de prompt-addon als de sanitizer inactief, dus byte-identiek. ⚠️ Anthropic-key
  ontbreekt in deze worktree-`.env.local` → Claude-judge mogelijk niet draaibaar;
  dan terugvallen op `eval:run-all` (OpenAI-judge) of de skip expliciet melden.
