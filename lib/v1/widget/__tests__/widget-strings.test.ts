// Run: node --import tsx --test lib/v1/widget/__tests__/widget-strings.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_STRINGS, resolveWidgetLang, widgetUiLanguage } from '../widget-strings';

test('widgetUiLanguage: taalspiegeling → auto, anders de vaste taal (alleen nl/en)', () => {
  assert.equal(widgetUiLanguage({ autoDetectLanguage: true, primaryLanguage: 'nl' }), 'auto');
  assert.equal(widgetUiLanguage({ autoDetectLanguage: false, primaryLanguage: 'en' }), 'en');
  assert.equal(widgetUiLanguage({ autoDetectLanguage: false, primaryLanguage: 'nl' }), 'nl');
  assert.equal(widgetUiLanguage({ autoDetectLanguage: false, primaryLanguage: 'de' }), 'nl');
});

test('resolveWidgetLang: browser nl* → nl, andere taal → en, onbekend → nl', () => {
  assert.equal(resolveWidgetLang('auto', ['nl-NL', 'en']), 'nl');
  assert.equal(resolveWidgetLang('auto', ['nl-BE']), 'nl');
  assert.equal(resolveWidgetLang('auto', ['en-US', 'nl']), 'en');
  assert.equal(resolveWidgetLang('auto', ['de-DE']), 'en');
  assert.equal(resolveWidgetLang('auto', []), 'nl');
  assert.equal(resolveWidgetLang('auto', undefined), 'nl');
});

test('resolveWidgetLang: vaste taal wint van de browser', () => {
  assert.equal(resolveWidgetLang('nl', ['en-US']), 'nl');
  assert.equal(resolveWidgetLang('en', ['nl-NL']), 'en');
});

test('WIDGET_STRINGS: nl en en hebben exact dezelfde, niet-lege sleutels', () => {
  assert.deepEqual(Object.keys(WIDGET_STRINGS.en).sort(), Object.keys(WIDGET_STRINGS.nl).sort());
  for (const lang of ['nl', 'en'] as const) {
    for (const [k, v] of Object.entries(WIDGET_STRINGS[lang])) assert.ok(v.trim().length > 0, `${lang}.${k} leeg`);
  }
});
