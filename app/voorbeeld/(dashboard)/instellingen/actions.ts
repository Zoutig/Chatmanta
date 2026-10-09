// Demo-versie van de settings-save (origineel: app/v1/app/instellingen/actions.ts).
// Geen server action: schrijft de patch naar de browser van de bezoeker
// (demo-store). De voorbeeldwidget en Preview lezen dezelfde opslag, dus een
// wijziging werkt direct door in nieuwe antwoorden.

import type { ActionResult } from '@/lib/errors/action';
import type { V1ChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import { writeDemoSettings } from '@/lib/voorbeeld/demo-store';

export async function saveChatbotSettingsAction(
  patch: Partial<V1ChatbotSettings>,
): Promise<ActionResult<{ settings: V1ChatbotSettings }>> {
  // Korte pauze zodat de opslaan-staat net zo voelt als in het echte dashboard.
  await new Promise((r) => setTimeout(r, 350));
  return { ok: true, settings: writeDemoSettings(patch) };
}
