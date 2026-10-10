'use client';

// V1 Widget-scherm: de drie stappen onder elkaar (spec §7.6). Elke stap is een
// eigen component; deze file bundelt ze en definieert de bewerkbare velden.

import type { V1ChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import type { WidgetLiveStatus } from './actions';
import { AppearanceStep } from './appearance-step';
import { InstallStep } from './install-step';
import { StatusStep } from './status-step';

/** De uiterlijk-velden die dit scherm bewerkt (thema bewust niet: de widget is altijd licht). */
export type EditableAppearance = Pick<
  V1ChatbotSettings,
  | 'accentColor'
  | 'position'
  | 'headerTitle'
  | 'subtitle'
  | 'welcomeMessage'
  | 'launcherText'
  | 'logoStyle'
  | 'customLogoDataUrl'
>;

export function V1WidgetForm({
  initial,
  fallbackTitle,
  starterQuestions,
  slug,
  origin,
  allowedDomains,
  liveStatus,
  widgetMissing,
  missingAfterMs,
}: {
  initial: EditableAppearance;
  fallbackTitle: string;
  starterQuestions: string[];
  slug: string;
  origin: string;
  allowedDomains: string[];
  liveStatus: WidgetLiveStatus;
  widgetMissing: boolean;
  missingAfterMs: number;
}) {
  return (
    <div className="v1-wg">
      <AppearanceStep initial={initial} fallbackTitle={fallbackTitle} starterQuestions={starterQuestions} />
      <InstallStep slug={slug} origin={origin} allowedDomains={allowedDomains} />
      <StatusStep liveStatus={liveStatus} widgetMissing={widgetMissing} missingAfterMs={missingAfterMs} />
    </div>
  );
}
