'use server';

// V1 Admin — server action: FAQ-refresh-cadans instellen.
// Port van app/actions/admin-config.ts — requireV0Auth() vervangen door
// requireJorionAdmin() (V1 auth-laag), revalidatePath naar de V1-route.

import { revalidatePath } from 'next/cache';
import { requireJorionAdmin } from '@/lib/auth';
import { setFaqRefreshCadence, type FaqRefreshCadence } from '@/lib/v1/admin/config';
import { actionTry, fail, type ActionResult } from '@/lib/errors/action';

function isCadence(v: unknown): v is FaqRefreshCadence {
  return v === 'weekly' || v === 'monthly';
}

export async function setFaqRefreshCadenceAction(
  cadence: FaqRefreshCadence,
): Promise<ActionResult> {
  return actionTry(async () => {
    await requireJorionAdmin();
    if (!isCadence(cadence)) fail('INPUT_INVALID', 'Ongeldige FAQ-cadans.');
    await setFaqRefreshCadence(cadence);
    revalidatePath('/v1/admin/instellingen');
    return {};
  });
}
