'use client';

import Link from 'next/link';
import { Globe } from 'lucide-react';
import { DEMO_SITE_PATH } from '@/lib/voorbeeld/demo-store';

// Vervangt "Uitloggen" in de demo: er is geen account, wel een voorbeeldwebsite.
export function DemoSidebarFoot() {
  return (
    <Link href={DEMO_SITE_PATH} className="v1-nav-item v1-nav-item--quiet">
      <Globe size={16} strokeWidth={1.8} aria-hidden="true" />
      Voorbeeldwebsite
    </Link>
  );
}
