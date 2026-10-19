// chatmanta.nl — de marketing-landingspagina. De volgorde komt uit PAGE_ORDER in lib/site/navigation.ts
// (ronde "site rustiger", okt 2026: 12 → 8 secties, bewijs en "eerlijk" vooraan).
// Secties leven in components/site/sections/* (contract: docs/site/CONTRACT.md);
// dit bestand stelt ze alleen samen.

import type { ComponentType } from 'react';
import type { Metadata } from 'next';
import Faq from '@/components/site/sections/faq';
import Features from '@/components/site/sections/features';
import FinalCta from '@/components/site/sections/final-cta';
import Hero from '@/components/site/sections/hero';
import Honest from '@/components/site/sections/honest';
import HowItWorks from '@/components/site/sections/how-it-works';
import LiveDemo from '@/components/site/sections/live-demo';
import Pricing from '@/components/site/sections/pricing';
import { PAGE_ORDER, type SectionKey } from '@/lib/site/navigation';
import { homeJsonLd } from '@/lib/site/structured-data';

/** Component per sectie. De rekenhulp ('roi') is geen eigen sectie: die zit in Prijzen. */
const SECTIONS: Record<Exclude<SectionKey, 'roi'>, ComponentType> = {
  hero: Hero,
  honest: Honest,
  demo: LiveDemo,
  how: HowItWorks,
  features: Features,
  pricing: Pricing,
  faq: Faq,
  finalCta: FinalCta,
};

// Canonical alleen hier (niet in de layout: subpagina's zouden hem anders erven).
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd()).replace(/</g, '\\u003c') }}
      />
      {PAGE_ORDER.map((key) => {
        if (key === 'roi') return null;
        const Sec = SECTIONS[key];
        return <Sec key={key} />;
      })}
    </>
  );
}
