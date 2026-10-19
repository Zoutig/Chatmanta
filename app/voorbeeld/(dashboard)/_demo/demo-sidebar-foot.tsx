'use client';

import Link from 'next/link';
import { ArrowLeft, Globe } from 'lucide-react';
import { ROUTES } from '@/lib/site/navigation';
import { DEMO_SITE_PATH } from '@/lib/voorbeeld/demo-store';

// Vervangt "Uitloggen" in de demo: er is geen account, wel een voorbeeldwebsite en
// een vaste weg terug naar de marketingsite. Gewone <a> voor chatmanta.nl: dat is een
// andere root layout, dus toch een volledige page load (app/_shell/app-root.tsx).
export function DemoSidebarFoot() {
  return (
    <>
      <Link href={DEMO_SITE_PATH} className="v1-nav-item v1-nav-item--quiet">
        <Globe size={16} strokeWidth={1.8} aria-hidden="true" />
        Voorbeeldwebsite
      </Link>
      <a href={ROUTES.home} className="v1-nav-item v1-nav-item--quiet">
        <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
        Naar chatmanta.nl
      </a>
    </>
  );
}
