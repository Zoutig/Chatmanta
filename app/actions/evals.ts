'use server';

// Eval server actions — read-only snapshot van public.eval_runs +
// eval_questions voor de Evals tab in de right panel.
//
// Auth: requireV0Auth() check vóór elke service-role read. proxy.ts gate-t
// pagina's, maar server actions zijn óók buiten een pagina-context
// aanroepbaar — defense-in-depth verplicht.
//
// 'use server' regel: alle exports moeten async functions zijn — daarom
// type-aliases niet via re-export. Importeer types waar nodig direct vanuit
// `@/lib/v0/server/evals-snapshot`.

import { getEvalSnapshot, type EvalSnapshot } from '@/lib/v0/server/evals-snapshot';
import { requireV0Auth } from './_auth';
import { actionTry, type ActionResult } from '@/lib/errors/action';

export async function getEvalSnapshotAction(): Promise<ActionResult<{ snapshot: EvalSnapshot }>> {
  return actionTry(async () => {
    await requireV0Auth();
    const snapshot = await getEvalSnapshot();
    return { snapshot };
  });
}
