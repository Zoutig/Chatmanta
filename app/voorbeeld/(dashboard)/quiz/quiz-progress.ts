// Voorbeeld: voortgang van de kennisquiz, in het geheugen van deze pagina-sessie.
// Per vraag het antwoord (null = overgeslagen). Opnieuw laden begint opnieuw.

type Progress = Readonly<Record<string, string | null>>;

let progress: Progress = {};
const listeners = new Set<() => void>();

export function recordQuizAnswer(questionId: string, antwoord: string | null): void {
  progress = { ...progress, [questionId]: antwoord };
  listeners.forEach((l) => l());
}

export function subscribeQuizProgress(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getQuizProgress(): Progress {
  return progress;
}

const EMPTY: Progress = {};
export function getServerQuizProgress(): Progress {
  return EMPTY;
}
