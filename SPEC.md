# SPEC — Widget warmer, persoonlijker & breder

## What

De chat-widget voelt nu vlak en onpersoonlijk: lange tekstblokken die je helemaal
moet doorscrollen, en een toon die "zakelijke loketmedewerker" is in plaats van
"iemand die met je meedenkt". We maken drie dingen beter, zonder een nieuwe
bot-versie en zonder de antwoordlengte-logica te wijzigen:

1. **Breder chat-frame** zodat tekst meer ademruimte heeft en minder opgestapeld
   oogt.
2. **Een nieuwe "Persoonlijk"-toon** die warm en informeel is — alsof je met een
   klant aan het appen bent — met hier en daar een emoji (spaarzaam), en die de
   nieuwe standaard wordt voor widgets.
3. Vetgedrukt en nette alinea's (bestaan al) blijven; de persoonlijke, beknopte
   toon + breder frame zorgen samen voor het "korter en prettiger leesbaar"-gevoel.

## Acceptance criteria

- [ ] Het desktop chat-paneel is **440px** breed (was 380px). Mobiel blijft
      fullscreen, ongewijzigd. De embed-iframe-loader (`public/widget.js`, 480px)
      blijft onaangeroerd en het bredere paneel past er nog binnen.
- [ ] Er is een nieuwe pipeline-toon `persoonlijk` naast `formal` / `neutral` /
      `casual`. `isTone('persoonlijk')` is `true`.
- [ ] De `persoonlijk`-tooninstructie: warm, je-vorm, korte appjes-achtige zinnen,
      **0–2 emoji per antwoord** (gedoseerd, nooit emoji-spam, **weg bij geld /
      klachten / medische onderwerpen**), nooit overdreven enthousiast, blijft
      feitelijk accuraat.
- [ ] `DEFAULT_TONE` blijft **`neutral`** — de eval-baseline verandert niet.
- [ ] Het klantendashboard heeft een nieuwe tone-of-voice-keuze **"Persoonlijk"**
      (`ToneOfVoice = 'personal'`) die mapt naar pipeline-toon `persoonlijk`.
- [ ] "Persoonlijk" is de **default-keuze** voor nieuwe chatbots.
- [ ] Demo-orgs die nu `friendly` zijn (dev-org, globex-inc/FysioPlus, demo-nieuw)
      staan op `personal`. `acme-corp` (Dakwerken) en `initech` (accountant)
      blijven bewust op `professional`.
- [ ] In de widget op een demo-org met de persoonlijke toon: antwoorden zijn warm,
      je-vorm, en bevatten af en toe (niet altijd) een passende emoji.
- [ ] `npm run typecheck` en `npm test` (style-tests) groen.

## Out of scope (bewust NIET)

- **Geen nieuwe bot-versie** (v0.9.2 e.d.). De LATEST blijft v0.9.1.
- **Geen wijziging aan de antwoordlengte** (`LENGTH_INSTRUCTION_*`,
  `outputStyleVersion`, `DEFAULT_LENGTH`). "Korter" komt van toon + layout, niet
  van een lengte-knop.
- **Geen wijziging aan `neutral` / `casual` / `formal`** — die blijven zoals ze
  zijn (o.a. zodat de eval-baseline op `neutral` byte-identiek blijft).
- **Geen eval-run.** Het nieuwe pad raakt de eval niet (eval draait op `neutral`).
  Verificatie = handmatige browser-smoke-test.
- **Geen markdown-renderer-wijziging.** Emoji zijn gewone unicode-tekens en
  renderen al; `renderMarkdownLite` hoeft niet aangepast.
- **Geen wijziging aan `acme-corp` / `initech`** toon (blijven `professional`).
- Geen font-/kleur-/lettergrootte-herontwerp van de bubble — alleen breedte.

## Edge cases

- **Org zonder resolvbare slug** → geen `chatbotOverrides` → valt terug op
  `DEFAULT_TONE` (`neutral`). Acceptabel: alle sandbox-orgs resolven; dit pad is
  eval/edge-only.
- **Klant koos eerder expliciet een andere toon** → blijft die toon houden; we
  veranderen alleen de demo-org-defaults en de default-keuze voor nieuwe bots.
- **Gevoelig onderwerp (prijs, klacht, medisch) in persoonlijke toon** → de
  instructie schrijft expliciet voor dán géén emoji te gebruiken.
- **Bestaande tests** die over de toon-set itereren (`tests/v0/style.test.ts`)
  moeten de nieuwe toon meenemen zonder te breken.
- **Stale `.next`-cache** kan de bredere-frame-wijziging maskeren → cache legen +
  dev-server herstarten vóór browserverificatie.
