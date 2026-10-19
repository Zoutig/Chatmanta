// V1 Kennisbank Q&A: de volgorde van opslaan, los van Supabase (pure orkestratie,
// testbaar met nep-callbacks). upsertQAItemAction in app/v1/app/kennisbank/qa/qa-actions.ts
// levert de echte ingest/opslag/uitzet-stappen aan.
//
// Doel: nooit stil kennisverlies.
//   1. Eerst de nieuwe ingest (alleen als het item actief is).
//      Bewerken + ingest mislukt → er verandert niets (oude antwoord blijft actief).
//   2. Dan de rij opslaan. Mislukt dat, dan wordt het nieuwe document weer uitgezet
//      (geen wees-document) en blijft het oude staan.
//   3. Pas daarna het oude document uit de retrieval halen.

export const QA_NOT_LEARNED =
  'Je chatbot kon dit antwoord nu niet verwerken. Er is niets gewijzigd; probeer het zo opnieuw.';

export type QAUpsertDeps = {
  /** Alleen bij bewerken: document van het bestaande item (gooit als het item niet bestaat). */
  readOldDocId: () => Promise<string | null>;
  /** Lees het Q&A-paar in; null = mislukt. */
  ingest: () => Promise<string | null>;
  /** Sla de rij op (insert of update) met dit document; geeft een foutmelding of null. */
  saveRow: (newDocId: string | null) => Promise<string | null>;
  /** Haal een document uit de retrieval. */
  retire: (docId: string) => Promise<void>;
};

export async function runQAUpsert(
  input: { isUpdate: boolean; active: boolean },
  deps: QAUpsertDeps,
): Promise<{ newDocId: string | null; notIngested: boolean }> {
  const oldDocId = input.isUpdate ? await deps.readOldDocId() : null;

  let newDocId: string | null = null;
  if (input.active) {
    newDocId = await deps.ingest();
    if (!newDocId && input.isUpdate) throw new Error(QA_NOT_LEARNED);
  }

  const saveError = await deps.saveRow(newDocId);
  if (saveError) {
    if (newDocId) await deps.retire(newDocId);
    throw new Error(saveError);
  }

  if (oldDocId && oldDocId !== newDocId) await deps.retire(oldDocId);
  return { newDocId, notIngested: input.active && !newDocId };
}
