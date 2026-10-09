// Run: node --import tsx --test lib/v1/widget/__tests__/appearance.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ACCENT,
  normalizeStarters,
  safeAccent,
  safeLogoDataUrl,
  toWidgetAppearance,
} from '../appearance';
import { V1_DEFAULT_CHATBOT_SETTINGS } from '@/app/v1/app/instellingen/settings-config';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';

test('safeAccent: alleen #rrggbb, anders navy', () => {
  assert.equal(safeAccent('#0d9488'), '#0d9488');
  assert.equal(safeAccent(' #AABBCC '), '#AABBCC');
  assert.equal(safeAccent('#abc'), DEFAULT_ACCENT);
  assert.equal(safeAccent('red'), DEFAULT_ACCENT);
  assert.equal(safeAccent(''), DEFAULT_ACCENT);
  assert.equal(safeAccent(null), DEFAULT_ACCENT);
});

test('safeLogoDataUrl: alleen base64-afbeeldingen', () => {
  assert.equal(safeLogoDataUrl(PNG), PNG);
  assert.equal(safeLogoDataUrl(SVG), SVG);
  assert.equal(safeLogoDataUrl(`${SVG}" onerror="alert(1)`), null);
  assert.equal(safeLogoDataUrl('javascript:alert(1)'), null);
  assert.equal(safeLogoDataUrl('data:text/html;base64,PGgxPg=='), null);
  assert.equal(safeLogoDataUrl('https://example.com/logo.png'), null);
  assert.equal(safeLogoDataUrl(null), null);
  assert.equal(safeLogoDataUrl(42), null);
});

test('normalizeStarters: trim, leeg eruit, max 4, max 120 tekens, uit = leeg', () => {
  assert.deepEqual(normalizeStarters(['  a ', '', '   ', 'b'], undefined), ['a', 'b']);
  assert.deepEqual(normalizeStarters(['1', '2', '3', '4', '5'], true), ['1', '2', '3', '4']);
  const long = normalizeStarters(['x'.repeat(300)], true)[0];
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('…'));
  assert.deepEqual(normalizeStarters(['a'], false), []);
  assert.deepEqual(normalizeStarters('a', true), []);
  assert.deepEqual(normalizeStarters([1, null, 'a'], true), ['a']);
});

const EXPECTED_KEYS = [
  'accentColor',
  'customLogoDataUrl',
  'headerTitle',
  'launcherText',
  'logoStyle',
  'position',
  'starterQuestions',
  'subtitle',
  'welcomeMessage',
];

test('toWidgetAppearance: exact deze velden, nooit interne settings', () => {
  const settings = {
    ...V1_DEFAULT_CHATBOT_SETTINGS,
    notificationEmail: 'geheim@example.com',
    extraInstructions: 'interne prompt',
    contactEmail: 'x@example.com',
    onbekendVeld: 'lek',
  };
  const a = toWidgetAppearance(settings, 'Bot');
  assert.deepEqual(Object.keys(a).sort(), EXPECTED_KEYS);
  const json = JSON.stringify(a);
  assert.ok(!json.includes('geheim@example.com'));
  assert.ok(!json.includes('interne prompt'));
  assert.ok(!json.includes('lek'));
});

test('toWidgetAppearance: titel-fallback en logo alleen bij custom-logo', () => {
  const base = { ...V1_DEFAULT_CHATBOT_SETTINGS };
  assert.equal(toWidgetAppearance(base, 'Org Bot').headerTitle, 'Org Bot');
  assert.equal(toWidgetAppearance({ ...base, chatbotName: 'Manta' }, 'Org Bot').headerTitle, 'Manta');
  assert.equal(toWidgetAppearance({ ...base, headerTitle: ' Hallo ' }).headerTitle, 'Hallo');

  const custom = toWidgetAppearance({ ...base, logoStyle: 'custom-logo', customLogoDataUrl: PNG });
  assert.equal(custom.logoStyle, 'custom-logo');
  assert.equal(custom.customLogoDataUrl, PNG);

  const bubbleWithStaleLogo = toWidgetAppearance({ ...base, logoStyle: 'chat-bubble', customLogoDataUrl: PNG });
  assert.equal(bubbleWithStaleLogo.customLogoDataUrl, null);

  const badLogo = toWidgetAppearance({ ...base, logoStyle: 'custom-logo', customLogoDataUrl: 'javascript:1' });
  assert.equal(badLogo.logoStyle, 'chat-bubble');
  assert.equal(badLogo.customLogoDataUrl, null);

  assert.equal(toWidgetAppearance({ ...base, accentColor: 'oops' }).accentColor, DEFAULT_ACCENT);
});
