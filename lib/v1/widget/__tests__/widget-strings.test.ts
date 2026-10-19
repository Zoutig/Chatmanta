// Run: node --import tsx --test lib/v1/widget/__tests__/widget-strings.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_ORG_MAX,
  CONTACT_SUBJECT_MAX,
  WIDGET_STRINGS,
  contactConsentText,
  lastVisitorQuestion,
  resolveWidgetLang,
  widgetUiLanguage,
} from '../widget-strings';
import { SUBJECT_MAX } from '../contact-validate';

test('contactConsentText: noemt bedrijf, doel en 90 dagen (nl + en)', () => {
  const nl = contactConsentText(WIDGET_STRINGS.nl, 'Bakkerij Voorbeeld');
  assert.match(nl, /Bakkerij Voorbeeld/);
  assert.match(nl, /contact met mij op te nemen/);
  assert.match(nl, /90 dagen/);
  assert.doesNotMatch(nl, /\{org\}/);
  const en = contactConsentText(WIDGET_STRINGS.en, 'Example Bakery');
  assert.match(en, /Example Bakery/);
  assert.match(en, /get in touch/);
  assert.match(en, /90 days/);
  assert.doesNotMatch(en, /\{org\}/);
});

test('contactConsentText: geen/lege naam → neutrale omschrijving; lange naam afgekapt', () => {
  for (const lang of ['nl', 'en'] as const) {
    const t = WIDGET_STRINGS[lang];
    for (const empty of [null, undefined, '', '   ']) {
      const s = contactConsentText(t, empty);
      assert.ok(s.includes(t.contactConsentOrgFallback), `${lang}: fallback ontbreekt`);
      assert.doesNotMatch(s, /\{org\}/);
    }
  }
  const long = 'X'.repeat(500);
  const s = contactConsentText(WIDGET_STRINGS.nl, long);
  assert.ok(s.includes('X'.repeat(CONSENT_ORG_MAX)));
  assert.ok(!s.includes('X'.repeat(CONSENT_ORG_MAX + 1)));
  // Witruimte (ook regeleinden) wordt één spatie.
  assert.match(contactConsentText(WIDGET_STRINGS.nl, '  De\n  Zaak '), /Ik geef De Zaak toestemming/);
});

test('contactConsent: beide talen bevatten precies één {org}-placeholder', () => {
  for (const lang of ['nl', 'en'] as const) {
    assert.equal(WIDGET_STRINGS[lang].contactConsent.split('{org}').length, 2, lang);
  }
});

test('lastVisitorQuestion: laatste niet-lege bezoekersvraag, afgekapt op de subject-limiet', () => {
  assert.equal(CONTACT_SUBJECT_MAX, SUBJECT_MAX);
  assert.equal(lastVisitorQuestion([]), '');
  assert.equal(lastVisitorQuestion([{ role: 'assistant', content: 'Hallo!' }]), '');
  assert.equal(
    lastVisitorQuestion([
      { role: 'user', content: 'Eerste vraag' },
      { role: 'assistant', content: 'Antwoord' },
      { role: 'user', content: '  Wat kost   een\nofferte? ' },
      { role: 'assistant', content: 'Daar heb ik geen informatie over.' },
    ]),
    'Wat kost een offerte?',
  );
  assert.equal(
    lastVisitorQuestion([
      { role: 'user', content: 'Echte vraag' },
      { role: 'user', content: '   ' },
    ]),
    'Echte vraag',
  );
  assert.equal(lastVisitorQuestion([{ role: 'user', content: 'a'.repeat(1000) }]).length, CONTACT_SUBJECT_MAX);
});

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
