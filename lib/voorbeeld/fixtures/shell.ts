// Vaste voorbeelddata voor de schil van het voorbeeld-dashboard.
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { NO_SIGNALS, type AttentionSignals } from '@/lib/v1/dashboard/attention';
import { DEMO_ORG_NAME } from '@/lib/voorbeeld/demo-defaults';
import { FIXTURE_UNANSWERED_QUESTIONS } from './gesprekken';

export const DEMO_SHELL: {
  orgName: string;
  chatbotStatus: ChatbotStatus;
  unansweredCount: number;
  contactRequestsNewCount: number;
  signals: AttentionSignals;
} = {
  orgName: DEMO_ORG_NAME,
  chatbotStatus: 'live',
  // Zijbalk telt open onbeantwoorde VRAGEN (zoals V1): gelijk aan de werklijst
  // "Wist je chatbot niet" en de Overzicht-kaart (afgeleid, niet hard gezet).
  unansweredCount: FIXTURE_UNANSWERED_QUESTIONS.length,
  contactRequestsNewCount: 2,
  // Een klaarstaande kennisquiz laat de teal stip bij Kennisbank zien.
  signals: { ...NO_SIGNALS, quizReady: true },
};
