// Demo-versie van de widget-acties (origineel: app/v1/app/widget/actions.ts).
// Aan/uit en "laatst gezien" leven in de browser van de bezoeker: de voorbeeld-
// website verbergt de chatknop als hij hier op pauze staat, en meldt zich bij
// elk bezoek (laatst gezien).

import type { ActionResult } from '@/lib/errors/action';
import { readDemoWidgetState, writeDemoWidgetState } from '@/lib/voorbeeld/demo-store';

export type WidgetLiveStatus = {
  isActive: boolean;
  lastSeenAt: string | null;
  lastSeenOrigin: string | null;
};

const pause = (ms = 350) => new Promise((r) => setTimeout(r, ms));

export async function toggleWidgetActiveAction(
  nextActive: boolean,
): Promise<ActionResult<{ isActive: boolean }>> {
  await pause();
  return { ok: true, isActive: writeDemoWidgetState({ isActive: nextActive === true }).isActive };
}

export async function checkWidgetInstallationAction(): Promise<ActionResult<WidgetLiveStatus>> {
  await pause(700);
  const s = readDemoWidgetState();
  return { ok: true, isActive: s.isActive, lastSeenAt: s.lastSeenAt, lastSeenOrigin: s.lastSeenOrigin };
}
