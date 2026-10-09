// Voorbeeld-dashboard: feedback insturen zonder server. Zelfde export en
// return-vorm als de V1-server-action. De invoer wordt net zo gevalideerd, maar
// er wordt niets opgeslagen, geüpload of gemaild.

import { isAppError } from '@/lib/errors/app-error';
import type { ActionResult } from '@/lib/errors/action';
import { parseFeedbackForm, assertValidAttachment } from '@/lib/controlroom/feedback-validate';
import { pretendDelay } from '@/lib/voorbeeld/fixtures/contact';

export async function submitFeedbackV1Action(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    parseFeedbackForm(formData);
    const raw = formData.get('attachment');
    const file = raw instanceof File && raw.size > 0 ? raw : null;
    if (file) assertValidAttachment(file);
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message, code: e.code };
    throw e;
  }
  await pretendDelay(500, 900);
  return { ok: true, id: `vb-fb-${Date.now()}` };
}
