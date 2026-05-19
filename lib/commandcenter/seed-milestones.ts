// Seed milestones uit goal-prompt §11.3 — v0 + v1 voorbeelden.
// ensureMilestonesSeeded() in storage.ts gebruikt deze als initiële set zodat
// het roadmap-scherm direct gevuld is.

import type { MilestoneInput } from './types';

export const SEED_MILESTONES: MilestoneInput[] = [
  // v0 milestones
  {
    title: 'RAG pipeline geeft correcte antwoorden op testset',
    roadmapPhase: 'v0',
    owner: 'Sebastiaan',
    status: 'Bezig',
    acceptanceCriteria: [
      '≥85% van de testset wordt correct beantwoord',
      'Pijnpunten uit foute antwoorden gedocumenteerd',
    ],
  },
  {
    title: 'Chatbot geeft veilige fallback bij ontbrekende info',
    roadmapPhase: 'v0',
    owner: 'Sebastiaan',
    status: 'Bezig',
    acceptanceCriteria: [
      'Geen verzonnen antwoorden wanneer chunks onder threshold liggen',
      'Duidelijke fallback-melding zichtbaar voor de bezoeker',
    ],
  },
  {
    title: 'Gemiddelde antwoordtijd acceptabel',
    roadmapPhase: 'v0',
    owner: 'Sebastiaan',
    status: 'Niet gestart',
    acceptanceCriteria: ['p50 < 4s end-to-end', 'p95 < 8s end-to-end'],
  },
  {
    title: 'Testdata en evals zijn opgezet',
    roadmapPhase: 'v0',
    owner: 'Sebastiaan',
    status: 'Bezig',
    acceptanceCriteria: [
      '≥50 testvragen met verwachte antwoorden',
      'Eval-pipeline draait per command + rapporteert pass/fail',
    ],
  },
  {
    title: 'Widget werkt stabiel op testsite',
    roadmapPhase: 'v0',
    owner: 'Sebastiaan',
    status: 'Niet gestart',
    acceptanceCriteria: ['Geen crashes op desktop + mobiel', 'Initial load < 200ms'],
  },

  // v1 milestones
  {
    title: 'Eerste testklant workspace aangemaakt',
    roadmapPhase: 'v1',
    owner: 'Samen',
    status: 'Niet gestart',
    acceptanceCriteria: ['Org-record bestaat', 'Login werkt', 'Klant kan zelf chunks zien'],
  },
  {
    title: 'Websitecontent ingeladen',
    roadmapPhase: 'v1',
    owner: 'Sebastiaan',
    status: 'Niet gestart',
    acceptanceCriteria: ['Crawler haalt 90% van pagina’s op', 'Chunks zijn doorzoekbaar'],
  },
  {
    title: 'Document upload werkt',
    roadmapPhase: 'v1',
    owner: 'Sebastiaan',
    status: 'Niet gestart',
    acceptanceCriteria: ['PDF + DOCX upload', 'Embeddings worden gegenereerd', 'Doorzoekbaar in RAG'],
  },
  {
    title: 'Widget live op testsite',
    roadmapPhase: 'v1',
    owner: 'Sebastiaan',
    status: 'Niet gestart',
    acceptanceCriteria: ['Embed-script werkt op externe site', 'CSP-friendly', 'Geen console-errors'],
  },
  {
    title: 'Basisdashboard werkt',
    roadmapPhase: 'v1',
    owner: 'Sebastiaan',
    status: 'Niet gestart',
    acceptanceCriteria: [
      'Klant ziet kennisbank-items',
      'Klant ziet basis-usage',
      'Klant kan tone-of-voice instellen',
    ],
  },
  {
    title: 'Chatbot beantwoordt minimaal 85% van testvragen goed',
    roadmapPhase: 'v1',
    owner: 'Sebastiaan',
    status: 'Niet gestart',
    acceptanceCriteria: [
      'Eval-score ≥85% op pre-launch testset',
      'Hallucination-rate < 2%',
    ],
  },
];
