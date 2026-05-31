# PLAN — Widget warmer, persoonlijker & breder

4 taken, sequentieel, één logische commit per taak. Typecheck na elke taak.

## Task 1: verbreed het desktop chat-paneel
- Files: `app/widget/components/chatmanta-widget.tsx`
- Approach: in de niet-mobiele tak van de dialog-`style` de breedte
  `min(380px, calc(100vw - 32px))` → `min(440px, calc(100vw - 32px))`. Alleen de
  desktop-tak; de mobiele tak (`100vw`/`100dvh` fullscreen) blijft ongemoeid. De
  embed-iframe-loader (`public/widget.js` `openDesktop` = 480px) blijft staan; 440
  past binnen 480 met marge voor de schaduw.
- Tests: geen unit-test; browserverificatie in gate 5c.
- Commit: `feat(widget): breder chat-paneel (380→440px) voor meer leesruimte`

## Task 2: nieuwe pipeline-toon `persoonlijk`
- Files: `lib/v0/style-types.ts`, `lib/v0/style.ts`
- Approach: voeg `'persoonlijk'` toe aan de `TONES`-tuple (`isTone` dekt het dan
  automatisch; `DEFAULT_TONE` blijft `'neutral'`). Voeg in `style.ts` een
  `TONE_INSTRUCTION['persoonlijk']`-string toe: warm, je-vorm, korte
  appjes-achtige zinnen, 0–2 emoji per antwoord (gedoseerd, géén bij
  geld/klachten/medisch), nooit overdreven, feitelijk accuraat. `Record<Tone, …>`
  dwingt af dat de string bestaat (typecheck vangt een vergeten entry).
- Tests: `tests/v0/style.test.ts` — `isTone('persoonlijk') === true`, en
  `buildSystemPrompt(base, {tone:'persoonlijk', length:'medium'})` bevat de
  persoonlijk-instructie.
- Commit: `feat(v0): nieuwe 'persoonlijk' toon — warm, je-vorm, spaarzaam emoji`

## Task 3: dashboard tone-of-voice `personal` + mapping + keuze
- Files: `lib/v0/klantendashboard/types.ts`,
  `lib/v0/klantendashboard/server/build-chatbot-overrides.ts`,
  `app/klantendashboard/instellingen/components/settings-form.tsx`
- Approach: voeg `'personal'` toe aan de `ToneOfVoice`-union; `TONE_MAP['personal']
  = 'persoonlijk'` (exhaustive `Record<ToneOfVoice, Tone>` → typecheck dwingt af).
  Voeg in `TONE_OPTIONS` een entry "Persoonlijk" toe en zet die vooraan (de
  voorgestelde standaard-keuze: warm, je-vorm, met af en toe emoji).
- Tests: typecheck (exhaustive Record). Geen render-test.
- Commit: `feat(klantendashboard): tone-of-voice 'Persoonlijk' (mapt naar persoonlijk)`

## Task 4: demo-org defaults → personal
- Files: `lib/v0/klantendashboard/mock/chatbot-settings.ts`
- Approach: zet `toneOfVoice` van `dev-org`, `globex-inc` en `demo-nieuw` van
  `'friendly'` → `'personal'`. `acme-corp` (Dakwerken) en `initech` (accountant)
  blijven bewust `'professional'`. `demo-nieuw` is tevens de template voor een
  verse klant-org → hiermee is "Persoonlijk = default voor nieuwe chatbots"
  gerealiseerd (er is geen aparte DEFAULT_CHATBOT_SETTINGS-constante).
- Tests: geen; gedekt door browser-smoke-test (gate 5c).
- Commit: `feat(v0): demo-orgs standaard op persoonlijke toon (zakelijke orgs ongemoeid)`

## Verificatie (gates)
- 5a Codex review-and-fix loop op de diff.
- 5b schone `next build` (`Remove-Item .next` eerst).
- 5c browser: widget op een persoonlijke demo-org (bv. FysioPlus) — warm, je-vorm,
  af en toe emoji, en het paneel zichtbaar breder. Light + mobiel viewport.
- 5d eval: **overgeslagen** — `DEFAULT_TONE` blijft `neutral`, dus de eval-baseline
  is byte-identiek; het nieuwe `persoonlijk`-pad wordt door de eval niet geraakt.
  Bovendien expliciet afgesproken: handmatige verificatie i.p.v. eval.
