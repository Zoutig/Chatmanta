# ChatManta — losse gezichtsonderdelen en tussenstanden

Deze set is opgebouwd voor één vaste pose op een canvas van **1536 × 1024**.
De lichaamsafbeelding en oogtexturen komen uit de gekozen cyaanmascotte en de
met de ingebouwde beeldgenerator gemaakte basisplaten. De mond en ooglidranden
zijn bewerkbare SVG-geometrie met vaste controlepunten. Daardoor zijn de
mondstanden en knipperovergangen continu te interpoleren.

## Wat zit erin?

- **136 mondbestanden:** 8 reeksen van 17 standen. Iedere stand als transparante
  PNG én SVG. De eerste stand van iedere reeks is dezelfde gesloten glimlach.
- **34 ooglidstanden:** 17 voor links en 17 voor rechts, inclusief volledig dicht.
- **34 complete oogstanden:** dezelfde knipperreeks, met oogwit en pupil erbij.
- **50 pupilposities:** een raster van 5 × 5 per oog.
- **18 pupilgroottes:** 9 per oog, van 80% tot 120%.
- **4 basisonderdelen:** linker/rechter oogwit en linker/rechter pupil + iris.
- **Een complete gelaagde SVG-rig**, een interactieve demo en een animatievoorbeeld.

Dit zijn in totaal **276 PNG-onderdelen**, met bijbehorende SVG-bestanden.
Pupil, iris en lichtreflecties vormen samen één verplaatsbaar onderdeel. Ze zijn
wel onafhankelijk van het oogwit en ooglid.

## Snel beginnen

1. Pak de hele ZIP uit en behoud de mappenstructuur.
2. Open `Demo/ChatManta_Interactief.html` in een gewone browser om de regelaars te
   gebruiken. De demo is zelfstandig en heeft geen internetverbinding nodig.
3. Gebruik `SVG/ChatManta_FaceRig.svg` als samengesteld startbestand. Alle
   afbeeldingen zijn daarin ingesloten; dit bestand kan zelfstandig worden gedeeld.
4. Gebruik de losse PNG's als je animatiepakket de SVG-masks of rasterlagen
   niet ondersteunt. De SVG-bestanden naast de losse onderdelen verwijzen naar
   de gedeelde bestanden in `Basis/`; houd die bestanden bij elkaar.

## Plaatsen zonder verspringen

Plaats eerst `Basis/mascotte_zonder_gezicht.png` op **x=0, y=0**.
Gebruik onderstaande coördinaten voor de **linkerbovenhoek van de hele PNG**.
Snijd transparante marges niet automatisch weg en centreer onderdelen niet opnieuw.

| Onderdeel | PNG-breedte × hoogte | Plaatsen op x, y |
| --- | --- | --- |
| Linkeroog, linkerpupil, linkerooglid | 245 × 236 | 578, 322 |
| Rechteroog, rechterpupil, rechterooglid | 204 × 213 | 902, 226 |
| Alle mondstanden | 240 × 220 | 777, 327 |

Links en rechts zijn gezien door de kijker. `manifest.json` bevat dezelfde
coördinaten, bestandsnamen en parameters per onderdeel.

## Laagvolgorde

Van onder naar boven:

1. Basis zonder ogen en mond.
2. Linker en rechter oogwit.
3. Linker en rechter pupil + iris; clip deze binnen de vorm van het oogwit.
4. Linker en rechter ooglid.
5. Mond.

De losse oogleden bevatten de cyaan huid die over het oog valt. De complete
`*_compleet` oogstanden combineren oogwit, pupil en ooglid al. Gebruik óf de
complete oogstand óf de drie losse onderdelen; leg ze niet dubbel op elkaar.

## Bestandsnamen en overgangen

**Knipperen:** `00` = volledig open, `16` = volledig dicht. Speel de reeks heen
en terug af of gebruik de continue `leftOpen` / `rightOpen` parameters.
Voor een natuurlijke eerste proef: ongeveer 100 ms sluiten en 150 ms openen.
De linkerkant en rechterkant kunnen onafhankelijk knipperen of knipogen.

**Kijkrichtingen:** `x0` = links, `x2` = midden, `x4` = rechts.
`y0` = omhoog, `y2` = midden, `y4` = omlaag. De PNG's verschuiven de pupil binnen
eenzelfde canvas. In een rig is een continue verplaatsing meestal mooier dan
het wisselen tussen de 25 bestanden.

**Mond:** `00` = gesloten glimlach, `16` = volledige doelvorm.

| Reeks | Gebruik |
| --- | --- |
| `smile` | Glimlachen en praten |
| `oh` | Ronde O / verwondering |
| `ee` | Brede E met tanden |
| `sad` | Bezorgd / lichte frons |
| `ah` | Open A |
| `oo` | Smalle U |
| `fv` | Gestileerde F/V-vorm |
| `l` | Gestileerde L-vorm met tong omhoog |

Dit zijn bruikbare gestileerde mondvormen; er zit geen automatische
spraakherkenning of lip-sync in. Voor een overgang tussen twee verschillende
mondfamilies kun je de SVG-controlepunten interpoleren. Iedere familie gebruikt
dezelfde padopbouw. Laat zo'n overgang niet abrupt naar een andere familie springen.

## Continue SVG-besturing

`rig.js` levert `MantaRig.set(svgElement, parameters)`. Gebruik de SVG inline in
HTML en laad `rig.js`. Voorbeeld:

```js
MantaRig.set(document.querySelector('svg'), {
  leftOpen: 0.5,       // 0 = dicht, 1 = open
  rightOpen: 1,
  gazeX: -0.6,         // -1 = links, 1 = rechts
  gazeY: 0.2,          // -1 = omhoog, 1 = omlaag
  pupilScale: 1,       // 0.8 tot 1.2
  mouthFamily: 'smile',
  mouthOpen: 0.45      // 0 tot 1
});
```

De interactieve demo is een werkend voorbeeld van deze bediening. De basispose
blijft vast; de regelaars bewegen alleen de gezichtscomponenten. Dit is een
2D-gezichtsrig en geen 3D-model. Voor een andere camerahoek of sterke vervorming
van de kop zijn aangepaste onderdelen nodig.

## Controle

Alle PNG-onderdelen zijn op leesbaarheid, canvasgrootte en transparantie
gecontroleerd. De samengestelde standen en animatie zijn gerenderd ter controle.
De besturingscode is met 40 combinaties van parameters gecontroleerd op geldige
geometrie en aanwezige SVG-elementen. Browserweergave kan per editor verschillen;
de HTML is hier niet in een geïnstalleerde browser getest.
