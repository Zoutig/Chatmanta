'use client';

import { StatusPill } from '@/app/v1/_ui/feedback';
import { useDemoWidgetState } from '@/lib/voorbeeld/demo-store';

export function DemoStatusPill() {
  const w = useDemoWidgetState();
  return <StatusPill status={w.isActive ? 'live' : 'paused'} />;
}
