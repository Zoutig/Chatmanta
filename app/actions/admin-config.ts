'use server';

// Admin Dashboard — globale operator-config (M5 deel C).
//
// Eerste en enige write: de FAQ-refresh-cadans (weekly|monthly). De cron
// (app/api/v0/cron/faq-snapshot) leest deze waarde om te bepalen hoe oud een
// klant-snapshot mag worden vóór de "Meest gestelde vragen"-ranglijst opnieuw
// wordt berekend (weekly = 7d, monthly = 30d).
//
// requireV0Auth() vóór de write — exact het admin-gate-patroon van
// app/actions/admin-crawl.ts. De setter (lib/v0/server/admin-config.ts) gebruikt
// een service-role client en bypasst dus RLS; deze gate is de daadwerkelijke
// toegangscontrole. Lezen gebeurt server-side direct op de pagina via
// getFaqRefreshCadence() — daar is geen action voor nodig.

import { revalidatePath } from 'next/cache';
import {
  setFaqRefreshCadence,
  type FaqRefreshCadence,
} from '@/lib/v0/server/admin-config';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';
import { requireV0Auth } from './_auth';

function isCadence(v: unknown): v is FaqRefreshCadence {
  return v === 'weekly' || v === 'monthly';
}

/**
 * Zet de FAQ-refresh-cadans. Valideert de input streng (alleen weekly|monthly,
 * anders INPUT_INVALID) en revalideert de instellingen-route waar de control staat.
 */
export async function setFaqRefreshCadenceAction(
  cadence: FaqRefreshCadence,
): Promise<ActionResult> {
  return actionTry(async () => {
    await requireV0Auth();
    if (!isCadence(cadence)) fail('INPUT_INVALID', 'Ongeldige FAQ-cadans.');
    await setFaqRefreshCadence(cadence);
    revalidatePath('/admindashboard/instellingen');
    return {};
  });
}
