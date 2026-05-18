// Statische roadmap-fase-info uit goal-prompt §10.1.
// Geen DB-data: dit zijn product-definities die meebewegen met het ChatManta-
// product. Bij wijziging van de fasering = code-update + nieuwe deploy.

import type { RoadmapPhase } from './types';

export type PhaseStatus =
  | 'Niet gestart'
  | 'Actief'
  | 'Bijna klaar'
  | 'Afgerond'
  | 'Gepauzeerd';

export const PHASE_STATUSES: PhaseStatus[] = [
  'Niet gestart',
  'Actief',
  'Bijna klaar',
  'Afgerond',
  'Gepauzeerd',
];

export type PhaseInfo = {
  phase: RoadmapPhase;
  label: string;
  goal: string;
  focus: string[];
  /** Default fase-status indien niets in cc_phase_status. */
  defaultStatus: PhaseStatus;
};

export const PHASE_INFO: PhaseInfo[] = [
  {
    phase: 'Backlog',
    label: 'Backlog',
    goal: 'Verzamelplaats voor ideeën die nog geen fase hebben.',
    focus: ['ideeën verzamelen', 'eerst valideren', 'later inplannen'],
    defaultStatus: 'Niet gestart',
  },
  {
    phase: 'v0',
    label: 'v0 — Technische proof of concept',
    goal: 'Bewijzen dat de kernflow werkt.',
    focus: [
      'simpele chatinterface',
      'basis kennisbank',
      'websitecontent of handmatige contentinvoer',
      'eerste vraag-antwoord flow',
      'eerste widget proof of concept',
    ],
    defaultStatus: 'Afgerond',
  },
  {
    phase: 'v0.5',
    label: 'v0.5 — Werkende interne demo',
    goal: 'Intern bruikbaar en testbaar maken.',
    focus: ['betere RAG', 'stabielere antwoorden', 'basis widget', 'testdata', 'bugfixes', 'logging'],
    defaultStatus: 'Afgerond',
  },
  {
    phase: 'v0.6',
    label: 'v0.6 — Kwaliteit en betrouwbaarheid',
    goal: 'Sneller, correcter en betrouwbaarder maken.',
    focus: [
      'betere retrieval',
      'betere bronselectie',
      'betere fallback wanneer info ontbreekt',
      'evaluatieset',
      'latency verbeteren',
      'hallucinaties verminderen',
      'antwoordkwaliteit meten',
    ],
    defaultStatus: 'Actief',
  },
  {
    phase: 'v1',
    label: 'v1 — Eerste praktijkversie',
    goal: 'Bruikbaar voor eerste testklanten.',
    focus: [
      'embeddable website widget',
      'websitecontent inladen',
      'documenten uploaden',
      'basisdashboard',
      'tone of voice instellingen',
      'meertaligheid',
      'usage tracking',
      'testklant live zetten',
    ],
    defaultStatus: 'Niet gestart',
  },
  {
    phase: 'v2',
    label: 'v2 — Commercieel verkoopbaarder',
    goal: 'Meer waarde voor onbekende klanten.',
    focus: [
      'chatlogs',
      'onbeantwoorde vragen',
      'eenvoudige analytics',
      'lead capture',
      'betere onboarding',
      'branding',
      'pricing tiers',
      'klantinstellingen',
    ],
    defaultStatus: 'Niet gestart',
  },
  {
    phase: 'v3',
    label: 'v3 — Action layer',
    goal: 'Chatbot voert acties uit.',
    focus: ['afspraken', 'reserveringen', 'offerte-intake', 'CRM/integraties', 'orderstatus', 'workflow automation'],
    defaultStatus: 'Niet gestart',
  },
  {
    phase: 'Later',
    label: 'Later',
    goal: 'Wensen die buiten de actieve roadmap vallen.',
    focus: ['nice-to-haves', 'experimenten', 'meeloop-ideeën'],
    defaultStatus: 'Niet gestart',
  },
];

export function getPhaseInfo(phase: RoadmapPhase): PhaseInfo {
  return PHASE_INFO.find((p) => p.phase === phase) ?? PHASE_INFO[0];
}

/** Welke fase is "actief" — gebruikt op het dashboard voor de focus-widget. */
export function getActivePhase(): RoadmapPhase {
  return 'v0.6';
}
