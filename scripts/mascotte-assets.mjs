// Genereert de mascotte-assets voor de marketingsite uit de ChatManta-FaceRig-bronmap.
//
//   node scripts/mascotte-assets.mjs "<pad naar ChatManta_FaceRig>"
//   (default: %USERPROFILE%/Documents/ChatManta_Mascotte/bron/ChatManta_FaceRig)
//
// Output (wordt gecommit; de bronmap zelf niet, die staat buiten de repo):
//   public/site/mascotte/manta-body.png   — lichaam zonder gezicht, halve resolutie
//   public/site/mascotte/manta-face.png   — atlas: oogwit, pupillen, ooglidstanden, mondstanden
//   components/site/mascotte/atlas.ts     — rechthoeken in de atlas + plaatsing (canvas-coördinaten 1536×1024)
// PNG i.p.v. WebP: proxy.ts laat op publieke paden alleen .png/.svg door.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const SRC = process.argv[2] ?? path.join(os.homedir(), 'Documents', 'ChatManta_Mascotte', 'bron', 'ChatManta_FaceRig');
const S = 0.5; // schaal t.o.v. het 1536×1024-bronvlak; ruim genoeg voor ~400 css-px × 2 dpr
const FRAMES = [0, 2, 4, 6, 8, 10, 12, 14, 16]; // 9 van de 17 tussenstanden; de engine kiest de dichtstbijzijnde
const FAMILIES = ['smile', 'ah', 'ee', 'oh', 'oo', 'sad'];
const EYES = { L: { name: 'links', at: [578, 322], size: [245, 236], p: [716, 426], look: [18, 14] }, R: { name: 'rechts', at: [902, 226], size: [204, 213], p: [994, 331], look: [12, 11] } };
const MOUTH = { at: [777, 327], size: [240, 220] };
const OUT_PUBLIC = path.join('public', 'site', 'mascotte');
const OUT_TS = path.join('components', 'site', 'mascotte', 'atlas.ts');

if (!fs.existsSync(SRC)) {
  console.error(`Bronmap niet gevonden: ${SRC}`);
  process.exit(1);
}
const pad = (n) => String(n).padStart(2, '0');
const sz = ([w, h]) => [Math.round(w * S), Math.round(h * S)];

// 1. Tegels verzamelen
const tiles = [];
const add = (key, file, size) => tiles.push({ key, file: path.join(SRC, file), size: sz(size) });
for (const side of ['L', 'R']) {
  const e = EYES[side];
  add(`${side}.white`, `Onderdelen/oogwit_${e.name}.png`, e.size);
  add(`${side}.pupil`, `Onderdelen/pupil_${e.name}.png`, e.size);
  for (const f of FRAMES) add(`${side}.lid.${f}`, `Knipperen/${e.name}_${pad(f)}_ooglid.png`, e.size);
}
for (const fam of FAMILIES) for (const f of FRAMES) add(`mouth.${fam}.${f}`, `Mond/${fam}_${pad(f)}.png`, MOUTH.size);

// 2. Shelf-packing, 2px marge tegen bleeding bij lineaire filtering
const MAXW = 1024;
const GAP = 2;
let x = 0, y = 0, rowH = 0, atlasW = 0;
for (const t of tiles) {
  const [w, h] = t.size;
  if (x + w > MAXW) { x = 0; y += rowH + GAP; rowH = 0; }
  t.rect = [x, y, w, h];
  x += w + GAP;
  rowH = Math.max(rowH, h);
  atlasW = Math.max(atlasW, x);
}
const atlasH = y + rowH;

const composites = await Promise.all(
  tiles.map(async (t) => ({
    input: await sharp(t.file).resize(t.size[0], t.size[1], { fit: 'fill' }).png().toBuffer(),
    left: t.rect[0],
    top: t.rect[1],
  })),
);
fs.mkdirSync(OUT_PUBLIC, { recursive: true });
await sharp({ create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(composites)
  .png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
  .toFile(path.join(OUT_PUBLIC, 'manta-face.png'));

await sharp(path.join(SRC, 'Basis', 'mascotte_zonder_gezicht.png'))
  .resize(Math.round(1536 * S), Math.round(1024 * S))
  .png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
  .toFile(path.join(OUT_PUBLIC, 'manta-body.png'));

// 3. atlas.ts
const r = (k) => tiles.find((t) => t.key === k).rect;
const atlas = {
  scale: S,
  size: [atlasW, atlasH],
  frames: FRAMES,
  eyes: Object.fromEntries(
    ['L', 'R'].map((s) => [
      s,
      { at: EYES[s].at, size: EYES[s].size, pupilCenter: EYES[s].p, look: EYES[s].look, white: r(`${s}.white`), pupil: r(`${s}.pupil`), lids: FRAMES.map((f) => r(`${s}.lid.${f}`)) },
    ]),
  ),
  mouth: { at: MOUTH.at, size: MOUTH.size, families: Object.fromEntries(FAMILIES.map((fam) => [fam, FRAMES.map((f) => r(`mouth.${fam}.${f}`))])) },
};
fs.mkdirSync(path.dirname(OUT_TS), { recursive: true });
fs.writeFileSync(
  OUT_TS,
  `// GEGENEREERD door scripts/mascotte-assets.mjs — niet met de hand aanpassen.\n` +
    `// Rechthoeken [x, y, w, h] in public/site/mascotte/manta-face.png; plaatsing (at/size/pupilCenter) in bron-coördinaten 1536×1024.\n` +
    `export const MANTA_ATLAS = ${JSON.stringify(atlas)} as const;\n\n` +
    `export type MouthFamily = keyof typeof MANTA_ATLAS.mouth.families;\n`,
);

for (const f of ['manta-face.png', 'manta-body.png']) {
  console.log(f, (fs.statSync(path.join(OUT_PUBLIC, f)).size / 1024).toFixed(0), 'KB');
}
console.log('atlas', atlasW, '×', atlasH, '·', tiles.length, 'tegels');
