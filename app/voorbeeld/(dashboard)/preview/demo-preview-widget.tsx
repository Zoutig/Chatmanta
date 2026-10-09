'use client';

import { toWidgetAppearance } from '@/lib/v1/widget/appearance';
import { useDemoSettings } from '@/lib/voorbeeld/demo-store';
import { V1PreviewWidget } from './v1-chat';

/** Preview-widget met het uiterlijk uit de browser van de bezoeker. */
export function DemoPreviewWidget() {
  const settings = useDemoSettings();
  return (
    <V1PreviewWidget orgId="voorbeeld" chatbotId="duinhoeve" appearance={toWidgetAppearance(settings, 'De Duinhoeve')} />
  );
}
