'use client';

// Laadt de instellingen uit de browser van de bezoeker (demo-store) en geeft ze
// aan het ongewijzigde V1-formulier. Vóór hydratie de demo-defaults; daarna
// opnieuw mounten met wat de bezoeker eerder opsloeg.

import { useHydrated, useDemoSettings } from '@/lib/voorbeeld/demo-store';
import { V1SettingsForm } from './settings-form';

export function DemoSettingsForm() {
  const hydrated = useHydrated();
  const settings = useDemoSettings();
  return <V1SettingsForm key={hydrated ? 'client' : 'ssr'} initial={settings} />;
}
