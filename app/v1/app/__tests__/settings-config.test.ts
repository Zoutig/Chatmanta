import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  V1_DEFAULT_CHATBOT_SETTINGS,
  mergeChatbotSettings,
  buildV1ChatbotInputs,
} from '../instellingen/settings-config';
import type { ChatbotSettings } from '@/lib/v0/klantendashboard/types';

test('mergeChatbotSettings: ontbrekend veld → default (niet lege string)', () => {
  const merged = mergeChatbotSettings({ chatbotName: 'Manta-bot' });
  assert.equal(merged.chatbotName, 'Manta-bot', 'aanwezig veld wint');
  assert.equal(merged.toneOfVoice, V1_DEFAULT_CHATBOT_SETTINGS.toneOfVoice, 'ontbrekend veld → default, niet ""');
  assert.equal(merged.fallbackMessage, V1_DEFAULT_CHATBOT_SETTINGS.fallbackMessage);
  assert.equal(merged.mayMentionPrices, true);
});

test('mergeChatbotSettings: aanwezige lege string wint van default (klant-keuze)', () => {
  const merged = mergeChatbotSettings({ fallbackMessage: '' });
  assert.equal(merged.fallbackMessage, '', 'expliciet lege string blijft leeg');
});

test('mergeChatbotSettings: corrupt/niet-object jsonb → volledige defaults', () => {
  assert.deepEqual(mergeChatbotSettings(null), V1_DEFAULT_CHATBOT_SETTINGS);
  assert.deepEqual(mergeChatbotSettings('nonsense'), V1_DEFAULT_CHATBOT_SETTINGS);
  assert.deepEqual(mergeChatbotSettings([1, 2]), V1_DEFAULT_CHATBOT_SETTINGS);
});

test('buildV1ChatbotInputs: settings → de overrides die askV1 doorgeeft', () => {
  const settings: ChatbotSettings = {
    ...V1_DEFAULT_CHATBOT_SETTINGS,
    chatbotName: 'FysioPlus-bot',
    companyDescription: 'Fysiotherapie in Utrecht.',
    toneOfVoice: 'professional',
    answerLength: 'short',
    fallbackMessage: 'Bel ons op 030-1234567.',
    sourceStrictness: 'strict',
  };
  const { overrides, persona } = buildV1ChatbotInputs(settings, 'DB-naam (fallback)');

  // toneOfVoice(6) → Tone(3); answerLength → Length.
  assert.equal(overrides.tone, 'formal', 'professional → formal');
  assert.equal(overrides.length, 'short', 'short → short');
  // Custom fallback en de instructie-injectie komen door.
  assert.equal(overrides.fallbackMessage, 'Bel ons op 030-1234567.');
  assert.match(overrides.extraSystemInstructions, /Fysiotherapie in Utrecht/, 'companyDescription geïnjecteerd');
  assert.match(overrides.extraSystemInstructions, /STRIKT MET BRONNEN/, 'source-strictness geïnjecteerd');
  // Persona-naam = de klant-gekozen chatbotName (niet de DB-fallback).
  assert.equal(persona.company, 'FysioPlus-bot');
});

test('buildV1ChatbotInputs: lege chatbotName → val terug op de DB-naam', () => {
  const settings: ChatbotSettings = { ...V1_DEFAULT_CHATBOT_SETTINGS, chatbotName: '   ' };
  const { persona } = buildV1ChatbotInputs(settings, 'Manta Bakkerij');
  assert.equal(persona.company, 'Manta Bakkerij');
});
