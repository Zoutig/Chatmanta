'use client';

// V1 Gesprekken › "Wist je chatbot niet": de werklijst met de echte server actions
// (org uit de sessie, SA-1 in de actions zelf). De publieke demo heeft een eigen
// wrapper met nep-acties rond dezelfde UnansweredList.

import { addQAFromTopQuestionAction } from '../top-questions-actions';
import { markQuestionResolvedAction } from '../actions';
import { CurrentBotAnswer } from '@/app/v1/app/kennisbank/qa/current-bot-answer';
import { PREVIEW_HREF } from '@/app/v1/app/kennisbank/qa/qa-saved-notice';
import { UnansweredList, type UnansweredRow } from './unanswered-list';

export type { UnansweredRow };

const conversationHref = (id: string) => `/v1/app/gesprekken/${id}`;

export function UnansweredTab({ questions }: { questions: UnansweredRow[] }) {
  return (
    <UnansweredList
      questions={questions}
      saveQA={addQAFromTopQuestionAction}
      resolveQuestion={markQuestionResolvedAction}
      BotAnswer={CurrentBotAnswer}
      conversationHref={conversationHref}
      previewHref={PREVIEW_HREF}
    />
  );
}
