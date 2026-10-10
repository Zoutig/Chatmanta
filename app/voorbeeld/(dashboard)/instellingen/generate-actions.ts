// Demo-versie van de AI-genereer-acties (origineel: app/v1/app/instellingen/generate-actions.ts).
// Geen LLM-call: vaste, passende voorstellen voor het fictieve vakantiepark.

import type { ActionResult } from '@/lib/errors/action';

export type ExtractedContact = { contactEmail: string; contactPhone: string; contactPageUrl: string };

const pause = () => new Promise((r) => setTimeout(r, 900));

export async function generateStarterQuestionsV1Action(): Promise<ActionResult<{ questions: string[] }>> {
  await pause();
  return {
    ok: true,
    questions: [
      'Welke accommodaties zijn geschikt voor honden?',
      'Hoe laat moet ik vertrekken op de laatste dag?',
      'Kan ik fietsen huren op het park?',
      'Wat zijn de annuleringsvoorwaarden?',
    ],
  };
}

export async function generateFallbackMessageV1Action(): Promise<ActionResult<{ message: string }>> {
  await pause();
  return {
    ok: true,
    message:
      'Dat weet ik helaas niet zeker. Onze receptie helpt je graag verder: bel 0118 000 000 of mail naar info@duinhoeve.example.',
  };
}

export async function extractContactInfoV1Action(): Promise<ActionResult<ExtractedContact>> {
  await pause();
  return {
    ok: true,
    contactEmail: 'info@duinhoeve.example',
    contactPhone: '0118 000 000',
    contactPageUrl: '/voorbeeld/website/contact',
  };
}
