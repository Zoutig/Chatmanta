// One-time crop script: snij de drie logo-variants uit het 1448x1086 design-board
// in public/logo/board.png en sla ze los op zodat we ze per use-case kunnen
// inzetten (sidebar mark, topbar wordmark, login lockup, widget FAB, mono).
//
// Run éénmaal: `node scripts/crop-logo.mjs`. Idempotent — overschrijft elke run.
//
// Crop-boxes empirisch bepaald uit het design-board (1448x1086 met dark #030C17 bg):
//   PRIMARY LOCKUP (manta + cyan ChatManta):  full top section x≈80-1370, y≈130-490
//   STANDALONE ICON (cyan manta only):        bottom-left      x≈80-470, y≈600-1010
//   MONOCHROME VERSION (witte manta + tekst): bottom-right     x≈540-1390, y≈610-1010
//
// We crashen graag op missende source — ander script zou zonder logo verder gaan.

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('public/logo');

// Stap 1: maak een transparant board PNG door de eerste #030C17-path uit de
// originele SVG te strippen en te renderen. Sharp begrijpt SVG met density.
const SVG_SRC = resolve('public/logo/board.svg');
const svg = readFileSync(SVG_SRC, 'utf8');
const cleaned = svg.replace(
  /<path d="M0 0 [^"]*" fill="#030C17" transform="translate\(0,0\)"\/>\s*/,
  '',
);
writeFileSync(`${OUT}/board-clean.svg`, cleaned);
await sharp(`${OUT}/board-clean.svg`)
  .resize({ width: 1448 })
  .toFile(`${OUT}/board-transparent.png`);
console.log('✓ board-transparent.png  (rendered from cleaned SVG)');

const SRC = `${OUT}/board-transparent.png`;

// Crop-boxes empirisch bepaald uit pixel-bbox scan op board-transparent.png:
//   primary lockup manta+text: x=76-1372  y=220-475
//   standalone manta:          x=60-550   y=616-976
//   mono manta:                x=720-970  y=617-908
//   mono lockup (manta+text):  x=720-1370 y=617-908
// We voegen ~10px padding toe per kant zodat geen anti-aliasing wordt afgekapt.
// Echte manta-bounds (na uitfilteren section-headers via row-gap analyse):
//   primary lockup: x=76-1372, y=220-475 (geen label binnen deze bounds)
//   standalone:     x=60-550,  y=718-976
//   mono manta:     x=720-970, y=770-908
//   mono lockup:    x=720-1370,y=770-908
const REGIONS = [
  { name: 'mark',      left: 50,  top: 712, width: 510,  height: 270 },
  { name: 'wordmark',  left: 66,  top: 215, width: 1316, height: 265 },
  { name: 'mono-mark', left: 710, top: 765, width: 270,  height: 148 },
  { name: 'mono',      left: 710, top: 765, width: 670,  height: 148 },
];

for (const r of REGIONS) {
  const out = `${OUT}/${r.name}.png`;
  await sharp(SRC)
    .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
    .toFile(out);
  console.log(`✓ ${r.name}.png  ${r.width}x${r.height}`);
}
