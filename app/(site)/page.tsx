// chatmanta.nl — de marketing-landingspagina. Volgorde = PAGE_ORDER in lib/site/navigation.ts
// (ronde "site rustiger", okt 2026: 12 → 8 secties, bewijs en "eerlijk" vooraan).
// Secties leven in components/site/sections/* (contract: docs/site/CONTRACT.md);
// dit bestand stelt ze alleen samen.

import type { Metadata } from 'next';
import Faq from '@/components/site/sections/faq';
import Features from '@/components/site/sections/features';
import FinalCta from '@/components/site/sections/final-cta';
import Hero from '@/components/site/sections/hero';
import Honest from '@/components/site/sections/honest';
import HowItWorks from '@/components/site/sections/how-it-works';
import LiveDemo from '@/components/site/sections/live-demo';
import Pricing from '@/components/site/sections/pricing';
import { homeJsonLd } from '@/lib/site/structured-data';

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
      <Hero />
      <Honest />
      <LiveDemo />
      <HowItWorks />
      <Features />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}
