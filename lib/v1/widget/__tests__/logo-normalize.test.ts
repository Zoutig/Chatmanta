// Self-check voor de pure logo-analyse. Run:
//   node --import tsx --test lib/v1/widget/__tests__/logo-normalize.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { analyzeLogoPixels, planLogoLayout, LIGHT_BG, DARK_BG } from '../logo-normalize';

type Px = [number, number, number, number];

/** w×h-afbeelding met achtergrond `bg` en een gevuld rechthoek `fg` op (x,y,rw,rh). */
function img(w: number, h: number, bg: Px, fg?: { px: Px; x: number; y: number; w: number; h: number }) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = fg && x >= fg.x && x < fg.x + fg.w && y >= fg.y && y < fg.y + fg.h;
      d.set(inside ? fg.px : bg, (y * w + x) * 4);
    }
  }
  return d;
}

const CLEAR: Px = [0, 0, 0, 0];
const WHITE: Px = [255, 255, 255, 255];
const BLUE: Px = [36, 89, 214, 255];

test('transparant logo met veel lege rand → bijgesneden tot de inhoud', () => {
  const a = analyzeLogoPixels(img(100, 100, CLEAR, { px: BLUE, x: 40, y: 30, w: 20, h: 40 }), 100, 100);
  assert.equal(a.kind, 'transparent');
  assert.deepEqual(a.box, { x: 40, y: 30, w: 20, h: 40 });
});

test('JPG met witte rand → effen achtergrond herkend en weggeknipt', () => {
  const a = analyzeLogoPixels(img(80, 80, WHITE, { px: BLUE, x: 20, y: 20, w: 40, h: 40 }), 80, 80);
  assert.equal(a.kind, 'solid-bg');
  assert.deepEqual(a.bg, [255, 255, 255]);
  assert.deepEqual(a.box, { x: 20, y: 20, w: 40, h: 40 });
  assert.equal(planLogoLayout(a).fill, '#ffffff');
});

test('foto (ongelijke hoeken) → niet bijsnijden, vierkant uit het midden (cover)', () => {
  const d = img(200, 100, WHITE);
  d.set([10, 10, 10, 255], 0); // hoek linksboven donker → geen effen rand
  const a = analyzeLogoPixels(d, 200, 100);
  assert.equal(a.kind, 'photo');
  const plan = planLogoLayout(a, 112);
  assert.deepEqual(plan.src, { x: 50, y: 0, w: 100, h: 100 });
  assert.deepEqual(plan.dest, { x: 0, y: 0, w: 112, h: 112 });
});

test('licht logo op transparant → donkere achtergrond, donker logo → wit', () => {
  const light = analyzeLogoPixels(img(50, 50, CLEAR, { px: WHITE, x: 10, y: 10, w: 30, h: 30 }), 50, 50);
  assert.equal(planLogoLayout(light).fill, DARK_BG);
  const dark = analyzeLogoPixels(img(50, 50, CLEAR, { px: [17, 17, 17, 255], x: 10, y: 10, w: 30, h: 30 }), 50, 50);
  assert.equal(planLogoLayout(dark).fill, LIGHT_BG);
});

test('passen: hoeken van het kader binnen de cirkel, gecentreerd', () => {
  const a = analyzeLogoPixels(img(100, 100, CLEAR, { px: BLUE, x: 0, y: 0, w: 100, h: 100 }), 100, 100);
  const { dest } = planLogoLayout(a, 112);
  const r = 56;
  const corner = Math.hypot(dest.w / 2, dest.h / 2);
  assert.ok(corner <= r * 0.821, `hoek op ${corner} > veilige straal`);
  assert.ok(Math.abs(dest.x - (112 - dest.w) / 2) < 1e-9);
});

test('breed woordmerk → melding; vierkant → geen melding', () => {
  const wide = analyzeLogoPixels(img(400, 100, CLEAR, { px: BLUE, x: 0, y: 30, w: 400, h: 40 }), 400, 100);
  assert.ok(planLogoLayout(wide).warning);
  const square = analyzeLogoPixels(img(100, 100, CLEAR, { px: BLUE, x: 10, y: 10, w: 80, h: 80 }), 100, 100);
  assert.equal(planLogoLayout(square).warning, null);
});

test('volledig leeg transparant bestand → geen crash, heel kader', () => {
  const a = analyzeLogoPixels(img(10, 10, CLEAR), 10, 10);
  assert.deepEqual(a.box, { x: 0, y: 0, w: 10, h: 10 });
});
