// Vaste voorbeelddata voor de schil van het voorbeeld-dashboard.
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { NO_SIGNALS, type AttentionSignals } from '@/lib/v1/dashboard/attention';
import { DEMO_ORG_NAME } from '@/lib/voorbeeld/demo-defaults';

export const DEMO_SHELL: {
  orgName: string;
  chatbotStatus: ChatbotStatus;
  unansweredCount: number;
  contactRequestsNewCount: number;
  signals: AttentionSignals;
} = {
  orgName: DEMO_ORG_NAME,
  chatbotStatus: 'live',
  unansweredCount: 7,
  contactRequestsNewCount: 2,
  // Een klaarstaande kennisquiz laat de teal stip bij Kennisbank zien.
  signals: { ...NO_SIGNALS, quizReady: true },
};
