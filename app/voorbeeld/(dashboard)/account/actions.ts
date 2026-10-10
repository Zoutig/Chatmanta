// Voorbeeld-dashboard: organisatienaam wijzigen zonder server. Zelfde export en
// return-vorm als de V1-server-action; de nieuwe naam leeft alleen in de pagina.

import type { ActionResult } from '@/lib/errors/action';
import { pretendDelay } from '@/lib/voorbeeld/fixtures/contact';

const ORG_NAME_MAX = 120;

export async function updateOrgNameAction(name: string): Promise<ActionResult<{ name: string }>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Organisatienaam mag niet leeg zijn.', code: 'INPUT_INVALID' };
  if (trimmed.length > ORG_NAME_MAX) {
    return { ok: false, error: `Organisatienaam is te lang (max ${ORG_NAME_MAX} tekens).`, code: 'INPUT_INVALID' };
  }
  await pretendDelay();
  return { ok: true, name: trimmed };
}
