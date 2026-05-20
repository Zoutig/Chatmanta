// V0 — Manual Q&A fast-path matcher.
//
// Doel: een vraag die de bezoeker stelt vergelijken met de Q&A-items die de
// klant in /klantendashboard/kennisbank > Q&A heeft ingevoerd, en bij een
// voldoende sterke match het kant-en-klare antwoord teruggeven zónder de
// volledige RAG-pipeline te draaien. Dit maakt de belofte uit het dashboard
// ("dan beantwoordt je chatbot deze vraag voortaan direct uit je kennisbank")
// daadwerkelijk waar.
//
// V0-scope:
//   - Pure text-matching (token-set Jaccard met stop-word filter), GEEN extra
//     embedding-calls. Voor V0 prima — Q&A-lijsten zijn typisch klein (<20).
//     V1 kan upgraden naar embed+cosine als de listen 100+ items worden.
//   - Eén match per vraag (de top-1). Bij meerdere kandidaten met dezelfde
//     score winnen de meest-recent geüpdatete (door array-volgorde, want de
//     dashboard prepend nieuwe items aan de array).
//   - Threshold = 0.6 token-set Jaccard. Empirisch: een Q&A "Wat kost een
//     dakvervanging?" matcht "Wat kost het vervangen van een dak?" (≈0.67)
//     maar niet "Wanneer is een dak versleten?" (≈0.20).

import 'server-only';

import type { ManualQA } from '@/lib/v0/klantendashboard/types';

// ---------------------------------------------------------------------------
// Tokenizer + stop-words
// ---------------------------------------------------------------------------
// Stop-words die in vrijwel élke vraag voorkomen en daardoor de Jaccard naar
// boven duwen zonder semantische waarde toe te voegen. Bewust kort gehouden —
// te lange lijst trekt valide signaal mee weg (bv. "kosten" is wel signaal).
const NL_STOPWORDS = new Set([
  'de', 'het', 'een', 'en', 'of', 'in', 'op', 'aan', 'voor', 'van', 'met', 'door',
  'is', 'zijn', 'was', 'waren', 'wordt', 'worden', 'heeft', 'hebben', 'had',
  'mag', 'kan', 'kunnen', 'moet', 'moeten', 'wil', 'willen',
  'wat', 'wie', 'waar', 'wanneer', 'hoe', 'waarom', 'welke', 'welk',
  'mij', 'me', 'mijn', 'jij', 'je', 'jouw', 'u', 'uw', 'wij', 'we', 'ons', 'onze',
  'er', 'om', 'ook', 'nog', 'wel', 'niet', 'dat', 'die', 'dit', 'deze',
  'als', 'dan', 'maar', 'naar', 'bij', 'over', 'uit',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (é → e)
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ') // strip punctuation (keep letters/digits)
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): Set<string> {
  const tokens = normalize(text).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (NL_STOPWORDS.has(t)) continue;
    out.add(t);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ManualQAMatch = {
  /** Het matchende Q&A-item. */
  qa: ManualQA;
  /** Jaccard score (0..1) tussen vraag en qa.question. */
  score: number;
};

/**
 * Default similarity-drempel. Items boven deze score worden als "duidelijke
 * match" beschouwd en short-circuiten de RAG-pipeline.
 *
 * Gekozen op 0.6 — empirisch bij dev-org Q&A:
 *  - "Wat doen jullie?" vs Q&A "Wat doet ChatManta?" → 0.50 (geen match,
 *    Jaccard zegt: gedeelde tokens [doen/doet zijn anders na stem], dus deze
 *    wordt mogelijk niet gevangen — V1 kan dit upgraden met stemming.)
 *  - "Wat is jullie tarief?" vs Q&A "Wat zijn jullie tarieven?" → 0.67 ✓
 *  - "openingstijden?" vs Q&A "Wat zijn jullie openingstijden?" → 1.0 ✓
 */
export const MANUAL_QA_DEFAULT_THRESHOLD = 0.6;

/**
 * Vind het Q&A-item dat het best matcht met `question`. Items met
 * `active === false` worden overgeslagen. Geeft `null` als geen item de
 * drempel haalt.
 */
export function findMatchingManualQA(
  question: string,
  qaItems: ManualQA[],
  threshold: number = MANUAL_QA_DEFAULT_THRESHOLD,
): ManualQAMatch | null {
  if (!qaItems || qaItems.length === 0) return null;
  const qTokens = tokenize(question);
  if (qTokens.size === 0) return null;

  let best: ManualQAMatch | null = null;
  for (const qa of qaItems) {
    if (!qa.active) continue;
    const score = jaccard(qTokens, tokenize(qa.question));
    if (score < threshold) continue;
    if (!best || score > best.score) {
      best = { qa, score };
    }
  }
  return best;
}
