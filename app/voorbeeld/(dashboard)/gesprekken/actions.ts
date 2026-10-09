// Voorbeeld-dashboard: Gesprekken-acties. Zelfde export en return-vorm als de
// V1-server action (app/v1/app/gesprekken/actions.ts), maar zonder server: in
// het voorbeeld "doet hij alsof". Er wordt niets opgeslagen.

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Markeert een gesprek als opgelost (in het voorbeeld: alleen bevestigen). */
export async function markConversationResolvedAction(
  threadId: string,
): Promise<{ ok: boolean; error?: string }> {
  await pause(450);
  return threadId ? { ok: true } : { ok: false, error: 'Gesprek niet gevonden.' };
}
