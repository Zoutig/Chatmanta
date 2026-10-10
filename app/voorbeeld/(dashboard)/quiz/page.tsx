// Voorbeeld-dashboard: Kennisquiz. Zelfde opbouw als V1; de vragen komen uit vaste
// voorbeelddata en de voortgang leeft in de browser (zie quiz-flow.tsx).

import { DEMO_QUIZ_QUESTIONS } from '@/lib/voorbeeld/fixtures/quiz';
import { QuizFlow } from './quiz-flow';
import './quiz.css';

export const metadata = { title: 'Kennisquiz · ChatManta' };

export default function VoorbeeldQuizPage() {
  return <QuizFlow questions={DEMO_QUIZ_QUESTIONS} />;
}
