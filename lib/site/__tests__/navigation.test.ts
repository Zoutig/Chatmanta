import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NAV_ITEMS, PAGE_ORDER, SECTION_IDS, anchor, type SectionKey } from '../navigation';

test('pagina telt hooguit 8 secties, hero eerst en slot-CTA laatst', () => {
  assert.ok(PAGE_ORDER.length <= 8, `nu ${PAGE_ORDER.length} secties`);
  assert.equal(PAGE_ORDER[0], 'hero');
  assert.equal(PAGE_ORDER[PAGE_ORDER.length - 1], 'finalCta');
  assert.equal(new Set(PAGE_ORDER).size, PAGE_ORDER.length, 'geen dubbele secties');
});

test('bewijs (demo) en "eerlijk" staan vóór hoe-het-werkt, functies en prijzen', () => {
  const at = (k: SectionKey) => PAGE_ORDER.indexOf(k);
  for (const early of ['honest', 'demo'] as const) {
    for (const later of ['how', 'features', 'pricing'] as const) {
      assert.ok(at(early) < at(later), `${early} moet vóór ${later}`);
    }
  }
});

test('elke sectie-id behalve de rekenhulp (zit in prijzen) staat op de pagina', () => {
  const keys = Object.keys(SECTION_IDS) as SectionKey[];
  for (const k of keys) {
    if (k === 'roi') continue;
    assert.ok(PAGE_ORDER.includes(k), `${k} ontbreekt in PAGE_ORDER`);
  }
});

test('nav volgt de paginavolgorde (actieve-sectie-indicator rekent daarop)', () => {
  const idx = NAV_ITEMS.map((n) => PAGE_ORDER.indexOf(n.key));
  assert.ok(idx.every((i) => i >= 0), 'elk nav-item verwijst naar een sectie op de pagina');
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
});

test('anchor bouwt /#id', () => {
  assert.equal(anchor('pricing'), '/#prijzen');
  assert.equal(anchor('roi'), '/#rekenhulp');
});
