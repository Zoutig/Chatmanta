// Vaste voorbeeld-kennisquiz: vragen over gaten in de kennisbank van De Duinhoeve.
import type { QuizQuestion } from '@/lib/controlroom/types';

const QUIZ_ID = 'vb-quiz-1';
const ORG_ID = 'vb-org-duinhoeve';
const CREATED = '2026-01-01T09:00:00.000Z';

function q(
  n: number,
  categorie: string,
  categorieLabel: string,
  vraag: string,
  context: string | null,
  opties: string[] | null = null,
): QuizQuestion {
  return {
    id: `vb-qz-${n}`,
    quizId: QUIZ_ID,
    organizationId: ORG_ID,
    categorie,
    categorieLabel,
    context,
    vraag,
    type: opties ? 'meerkeuze' : 'open',
    opties,
    volgorde: n,
    bron: 'ai',
    goedgekeurd: true,
    verwijderd: false,
    createdAt: CREATED,
    updatedAt: CREATED,
  };
}

export const DEMO_QUIZ_QUESTIONS: QuizQuestion[] = [
  q(
    1,
    'faciliteiten',
    'Faciliteiten',
    'Kunnen gasten een babysit regelen via het park?',
    'Bezoekers vroegen dit 3 keer in de afgelopen maand. Je website zegt er niets over.',
    ['Nee, dat regelen we niet', 'Ja, via de receptie', 'Ja, via het animatieteam Helmgras'],
  ),
  q(
    2,
    'huisregels',
    'Huisregels',
    'Mogen gasten een opblaasbadje of trampoline in de tuin van hun accommodatie zetten?',
    null,
    ['Ja, dat mag', 'Alleen een opblaasbadje', 'Nee, dat mag niet'],
  ),
  q(
    3,
    'boeken',
    'Boeken en betalen',
    'Kunnen gasten hun verblijf ter plekke met een paar nachten verlengen?',
    'Je chatbot kon deze vraag twee keer niet beantwoorden.',
  ),
  q(
    4,
    'activiteiten',
    'Activiteiten',
    'Mogen gasten hun eigen kano of sup meenemen, en waar kunnen ze die te water laten?',
    null,
  ),
  q(
    5,
    'faciliteiten',
    'Faciliteiten',
    'Kunnen gasten een verjaardagstaart of versiering laten klaarzetten in de accommodatie?',
    'Een bezoeker vroeg dit voor een verrassing bij aankomst.',
  ),
];
