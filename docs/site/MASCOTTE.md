# De ChatManta-mascotte

Een kleine, cyaan manta met grote ogen. Hij maakt de publieke kant van ChatManta persoonlijker: hij zwemt, kijkt je aan, knippert, denkt na en praat mee met de chat. Dit document is de vaste bron voor iedereen (mens of agent) die iets ontwerpt waar hij in voorkomt.

**Live:** in de hero van chatmanta.nl (boven het voorbeeldgesprek), op de 404-pagina (zoekend rondkijken), op de foutpagina van de site (verrast) en als verteller van de rondleiding op /voorbeeld (spreekt de uitleg uit).

## Waar staat wat

| Wat | Pad | Gebruik |
|---|---|---|
| Bronbeelden (face-rig) | `design/mascotte/bron/` | Lichaam zonder gezicht + origineel (1536×1024), oogwit, pupillen, 17 ooglidstanden per oog, 8 mondfamilies × 17 standen, `manifest.json` (coördinaten), `LEESMIJ_facerig.md` |
| Stills per expressie | `design/mascotte/stills/*.png` | Transparant, 768×512: `rust blij praten verrast denkt bezorgd ogen-dicht knipoog`. Voor mockups, OG-beelden, mails, decks |
| Overzichtsplaten | `design/mascotte/referentie/` | Alle mondstanden, ooglidreeks/pupillen, en de 6 losse poses |
| Site-assets | `public/site/mascotte/manta-body.png`, `manta-face.png` | Gegenereerd (110 KB samen), niet met de hand bewerken |
| Engine + component | `components/site/mascotte/` | `MantaMascotte` (React), `signalMascotte()` (bus), `manta-engine.ts`, gegenereerde `atlas.ts` |
| Generator | `scripts/mascotte-assets.mjs` | `npm run mascotte:assets` (site-assets) · `npm run mascotte:assets -- --stills` (ook stills) |
| Volledig archief | buiten de repo: `Documents/ChatManta_Mascotte/` op Sebs PC | Werkdemo's v1–v5, de 6-posesbestanden (SVG, 12 MB), gelaagde SVG, kijkrichting- en pupilgrootte-PNG's |

## Gebruiken in de site

```tsx
import { MantaMascotte } from '@/components/site/mascotte/manta-mascotte';

<MantaMascotte className="mijn-sectie-mascotte" />              // breedte/plek via CSS van de sectie
<MantaMascotte mode="lost" className="..." />                 // andere basisstemming
```

- Decoratief (`aria-hidden`), laadt pas na hydratie (nooit LCP), pauzeert buiten beeld en bij een verborgen tabblad, staat stil bij `prefers-reduced-motion`, en tekent zonder WebGL een platte versie.
- Verhouding is altijd 3:2 (`aspect-ratio: 1536/1024`). De manta vult ~92% van het vlak; reken op wat lucht rondom.
- Muis volgen, knipperen en rondkijken doet hij zelf. Klik = knipoog + blij.

**Aansturen vanuit een andere component** (zonder dat ze elkaar kennen):

```ts
import { signalMascotte } from '@/components/site/mascotte/bus';

signalMascotte({ talk: true });                 // praten aan (bv. tijdens streamen)
signalMascotte({ talk: false });
signalMascotte({ mode: 'think' });              // 'idle' | 'happy' | 'shy' | 'wow' | 'think' | 'lost'; null = terug naar de basisstemming
signalMascotte({ lookAt: element, lookMs: 1200 }); // even naar een element kijken
```

Let op: het signaal gaat naar **alle** mascottes op de pagina. Eén per pagina is de bedoeling.

**Eén specifieke mascotte direct besturen** (bv. laten "uitspreken"):

```tsx
<MantaMascotte onReady={(api) => setApi(api)} />   // api is null na unmount
api.speak('Dit is het dashboard.', { onWord: (i) => toonTotWoord(i), onEnd }); // mond volgt de klinkers
api.lookAt(element, 900); api.setMode('happy'); api.wink(); api.stop();
```

`speak` maakt een tijdlijn van lettergrepen (~5 per seconde; klinkergroep → mondvorm: a → ah, o → oh, e/i/ij → ee, oe/u/ui/eu → oo) met pauzes bij leestekens. `onWord` vuurt per witruimte-gescheiden woord, dus je kunt de tekst in hetzelfde tempo laten verschijnen. Voorbeeld: de rondleiding op /voorbeeld (`app/voorbeeld/(dashboard)/_overview/voorbeeld-tour.tsx`), via de optionele `narration`-prop van `OnboardingTour`.

Voorbeeld van een complete choreografie: `components/site/sections/hero/hero-chat.tsx` (vraag lezen → nadenken tijdens typen → meepraten met het antwoord → blij naar de bronvermelding kijken).

## Ontwerpregels

- **Achtergrond:** hij is gemaakt voor de navy vlakken (`--ink`, `--navy-hi`). Op licht kan, maar de zachte gloed rond het lichaam valt dan weg; test het.
- **Grootte:** minimaal ~180 px breed (gezicht moet leesbaar blijven); in de hero 300 px mobiel, 420 px desktop.
- **Eén signatuurmoment per sectie** (zie `CONTRACT.md` §6). De mascotte is een bijrol: hij mag tekst of knoppen nooit bedekken.
- **Niet zelf tekenen of hertekenen.** Nieuwe uitdrukkingen = combinaties van bestaande mond-/ooglidstanden. Nieuwe poses (andere lichaamshouding) moeten als nieuw bronmateriaal komen, op exact dezelfde canvas (1536×1024) en houding als `mascotte_zonder_gezicht.png`, anders past de face-rig niet.
- **Het logo blijft het logo.** De mascotte vervangt `Mark`/`Logo` niet (`CONTRACT.md` §3).
- **Stijl:** zacht, glanzend, vriendelijk; geen tekstballonnen met verzonnen claims ernaast.

## Hoe het werkt (kort)

- **Lichaam:** één afbeelding, vervormd met een WebGL-mesh (96×64). Vleugelslag naar Fish e.a. 2016 (*Aerospace* 3(3):20): scharnier met stille wortel, korte golf wortel→tip (< 1 golflengte), achterrand loopt achter, neerslag 43% / opslag 57% van de slag, lichaam deint tegen de slag in. De fase wordt per frame opgeteld (nooit `tijd × snelheid`: dat gaf haperingen bij tempowissels).
- **Gezicht:** elk frame op een klein 2D-canvas: oogwit → pupil (geclipt binnen het oogwit) → ooglidstand → mondstand. Dat canvas gaat als textuur door dezelfde mesh, zodat gezicht en lichaam één geheel blijven.
- **Gedrag:** ogen springen snel (saccades), de kop draait traag mee; bij een grote blikwissel vaak een knipper; knipperen ~90 ms dicht / ~150 ms open; praten = lettergrepen van 0,14–0,26 s met wisselende mondfamilie, en de mond sluit altijd eerst vóór een vormwissel (alle families delen stand 00).
- **Wat niet werkte** (niet herhalen): losse lagen om scharnierpunten draaien (zichtbare naden), twee poses overvloeien als "animatie" (spookbeelden), het hele oog verschuiven om te kijken (dubbele pupil).

## Bekende open punten

- De poses 04–06 (zwaaien, knipoog, nieuwsgierig) uit de 6-posesset hebben een andere lichaamshouding en zijn daarom nog niet bruikbaar in de rig.
- Statuspagina's: `StatusPage` (`components/site/status-page.tsx`) heeft een prop `mascotte={mode}` die hem rechts op een navy paneel zet (mobiel erboven). 404 = `lost`, fout = `wow`.
- Mogelijke volgende plekken: live-demo (praten tijdens het echte antwoord), laadstates.
