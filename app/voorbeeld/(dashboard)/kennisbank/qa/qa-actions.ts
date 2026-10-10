// Voorbeeld-dashboard: Q&A-acties zonder server. Zelfde exports en return-vormen
// als de V1-server-actions (elke actie geeft de volledige lijst terug). De lijst
// leeft in het geheugen van deze pagina-sessie; er wordt niets ge-ingest.

import type { ActionResult } from '@/lib/errors/action';
import { DEMO_QA_ITEMS } from '@/lib/voorbeeld/fixtures/kennisbank';
import { pretendDelay } from '@/lib/voorbeeld/fixtures/contact';

type QAItemShape = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  active: boolean;
  ingestedDocumentId: string | null;
};

let store: QAItemShape[] = DEMO_QA_ITEMS.map((q) => ({ ...q }));

const fakeDocId = () => `vb-doc-qa-${Math.random().toString(36).slice(2, 10)}`;

export async function upsertQAItemAction(input: {
  id?: string;
  question: string;
  answer: string;
  category?: string | null;
  active: boolean;
}): Promise<ActionResult<{ qa: QAItemShape[] }>> {
  const q = input.question.trim().slice(0, 2000);
  const a = input.answer.trim().slice(0, 8000);
  const cat = (input.category?.trim() || null) as string | null;
  await pretendDelay();
  const next: QAItemShape = {
    id: input.id ?? `vb-qa-${Date.now()}`,
    question: q,
    answer: a,
    category: cat,
    active: input.active,
    ingestedDocumentId: input.active ? fakeDocId() : null,
  };
  store = input.id && store.some((x) => x.id === input.id)
    ? store.map((x) => (x.id === input.id ? next : x))
    : [next, ...store];
  return { ok: true, qa: store };
}

export async function deleteQAItemAction(id: string): Promise<ActionResult<{ qa: QAItemShape[] }>> {
  await pretendDelay();
  store = store.filter((x) => x.id !== id);
  return { ok: true, qa: store };
}

export async function setQAActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ qa: QAItemShape[] }>> {
  if (!store.some((x) => x.id === id)) {
    return { ok: false, error: 'Q&A-item niet gevonden.', code: 'NOT_FOUND' };
  }
  await pretendDelay(250, 450);
  store = store.map((x) =>
    x.id === id ? { ...x, active, ingestedDocumentId: active ? x.ingestedDocumentId ?? fakeDocId() : x.ingestedDocumentId } : x,
  );
  return { ok: true, qa: store };
}
