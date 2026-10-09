'use client';

// Voedt het ongewijzigde V1-Widget-scherm met de instellingen en widgetstatus uit
// de browser van de bezoeker. Na hydratie opnieuw mounten met de opgeslagen waarden.

import { normalizeStarters } from '@/lib/v1/widget/appearance';
import { useDemoSettings, useDemoWidgetState, useHydrated } from '@/lib/voorbeeld/demo-store';
import { DEMO_ORG_SLUG } from '@/lib/voorbeeld/constants';
import { V1WidgetForm } from './widget-form';

export function DemoWidgetForm({ origin, missingAfterMs }: { origin: string; missingAfterMs: number }) {
  const hydrated = useHydrated();
  const s = useDemoSettings();
  const w = useDemoWidgetState();
  return (
    <V1WidgetForm
      key={hydrated ? 'client' : 'ssr'}
      initial={{
        accentColor: s.accentColor,
        position: s.position,
        headerTitle: s.headerTitle,
        subtitle: s.subtitle,
        welcomeMessage: s.welcomeMessage,
        launcherText: s.launcherText,
        logoStyle: s.logoStyle,
        customLogoDataUrl: s.customLogoDataUrl,
      }}
      fallbackTitle={s.chatbotName.trim() || 'De Duinhoeve'}
      starterQuestions={normalizeStarters(s.starterQuestions, s.showStarterQuestions)}
      slug={DEMO_ORG_SLUG}
      origin={origin}
      allowedDomains={['www.chatmanta.nl']}
      liveStatus={w}
      widgetMissing={false}
      missingAfterMs={missingAfterMs}
    />
  );
}

