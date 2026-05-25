// Mock handmatige Q&A's per V0 sandbox-org.
//
// In V0 bestaat manual_qa_items nog niet als tabel. Deze mock voorziet de
// Kennisbank-tab Q&A van realistische voorbeelden. Bij V1 wordt dit een
// echte DB-tabel + listManualQA(orgId) wrapper.

import type { OrgSlug } from '../../server/active-org';
import type { ManualQA } from '../types';

const NOW = new Date().toISOString();

const MOCK_QA: Record<OrgSlug, ManualQA[]> = {
  'dev-org': [
    {
      id: 'dev-qa-1',
      question: 'Wat is ChatManta?',
      answer:
        'ChatManta is een AI-chatbot die je website-bezoekers direct antwoord geeft op basis van jouw eigen content.',
      category: 'Algemeen',
      active: true,
      updatedAt: NOW,
    },
  ],
  'acme-corp': [
    {
      id: 'acme-qa-1',
      question: 'Werken jullie ook in het weekend?',
      answer:
        'Onze monteurs werken doordeweeks van 07:00 tot 17:00. Voor spoed-reparaties bieden we 24/7 noodservice — bel dan 020-1234567.',
      category: 'Openingstijden',
      active: true,
      updatedAt: NOW,
    },
    {
      id: 'acme-qa-2',
      question: 'Geven jullie garantie op een nieuw dak?',
      answer:
        'Ja, op een volledige dakvervanging geven we 10 jaar garantie op het werk en de materialen. Voor reparaties geldt 2 jaar garantie.',
      category: 'Garantie',
      active: true,
      updatedAt: NOW,
    },
    {
      id: 'acme-qa-3',
      question: 'Hoe vraag ik een offerte aan?',
      answer:
        'Je kunt een vrijblijvende offerte aanvragen via het formulier op onze contactpagina, of door te bellen naar 020-1234567. We komen altijd langs voor een inspectie.',
      category: 'Offerte',
      active: true,
      updatedAt: NOW,
    },
    {
      id: 'acme-qa-4',
      question: 'In welke regio werken jullie?',
      answer:
        'We werken in Noord-Holland: Amsterdam, Haarlem, Zaanstad, Purmerend en de directe omgeving. Verder weg is mogelijk in overleg.',
      category: 'Werkgebied',
      active: true,
      updatedAt: NOW,
    },
    {
      id: 'acme-qa-5',
      question: 'Wat kost een dakinspectie?',
      answer:
        'Een standaard dakinspectie is gratis bij offerte-aanvraag. Een uitgebreide schaderapportage met foto\'s kost €145.',
      category: 'Prijzen',
      active: false,
      updatedAt: NOW,
    },
  ],
  'globex-inc': [
    {
      id: 'globex-qa-1',
      question: 'Heb ik een verwijzing van mijn huisarts nodig?',
      answer:
        'Nee, fysiotherapie is direct toegankelijk. Wel raden we bij langdurige klachten aan om eerst met je huisarts te overleggen.',
      category: 'Afspraak',
      active: true,
      updatedAt: NOW,
    },
    {
      id: 'globex-qa-2',
      question: 'Worden behandelingen vergoed door mijn zorgverzekering?',
      answer:
        'Fysiotherapie zit in de aanvullende verzekering. Het aantal vergoede behandelingen hangt af van je polis — check je verzekering of bel ons voor advies.',
      category: 'Vergoeding',
      active: true,
      updatedAt: NOW,
    },
    {
      id: 'globex-qa-3',
      question: 'Hoe lang duurt een behandeling?',
      answer:
        'Een eerste intake duurt 45 minuten. Vervolgbehandelingen zijn meestal 25-30 minuten.',
      category: 'Behandeling',
      active: true,
      updatedAt: NOW,
    },
    {
      id: 'globex-qa-4',
      question: 'Hoe maak ik een afspraak?',
      answer:
        'Bel ons op 030-9876543 of gebruik het online afsprakensysteem op onze website. Spoed-afspraken zijn meestal binnen 24 uur mogelijk.',
      category: 'Afspraak',
      active: true,
      updatedAt: NOW,
    },
  ],
  initech: [
    {
      id: 'initech-qa-1',
      question: 'Doen jullie ook belastingaangiftes voor particulieren?',
      answer:
        'Ja, we doen IB-aangiftes voor zowel ondernemers als particulieren. Standaard-aangifte voor particulieren is €95 incl. BTW.',
      category: 'Diensten',
      active: true,
      updatedAt: NOW,
    },
    {
      id: 'initech-qa-2',
      question: 'Tot wanneer kan ik mijn aangifte indienen?',
      answer:
        'De deadline voor de IB-aangifte is 1 mei. Met uitstel via ons kantoor kan dit verlengd worden tot 1 september.',
      category: 'Deadlines',
      active: true,
      updatedAt: NOW,
    },
    {
      id: 'initech-qa-3',
      question: 'Wat zijn jullie tarieven voor MKB-administratie?',
      answer:
        'Onze MKB-pakketten beginnen bij €249 per maand voor een ZZP-er. Voor bedrijven met personeel werken we op offerte-basis.',
      category: 'Tarieven',
      active: true,
      updatedAt: NOW,
    },
  ],
  // Lege demo-org — nog geen handmatige Q&A's.
  'demo-nieuw': [],
};

export function getMockManualQA(orgSlug: OrgSlug): ManualQA[] {
  return MOCK_QA[orgSlug] ?? [];
}
