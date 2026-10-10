// chatmanta.nl — de marketing-landingspagina. Volgorde = spec §5 / mockup-final.
// Secties leven in components/site/sections/* (contract: docs/site/CONTRACT.md);
// dit bestand stelt ze alleen samen.

import type { Metadata } from 'next';
import DashboardShowcase from '@/components/site/sections/dashboard-showcase';
import Faq from '@/components/site/sections/faq';
import Features from '@/components/site/sections/features';
import FinalCta from '@/components/site/sections/final-cta';
import Hero from '@/components/site/sections/hero';
import Honest from '@/components/site/sections/honest';
import HowItWorks from '@/components/site/sections/how-it-works';
import LiveDemo from '@/components/site/sections/live-demo';
import Pricing from '@/components/site/sections/pricing';
import Problem from '@/components/site/sections/problem';
import RoiCalculator from '@/components/site/sections/roi-calculator';
import TrustStrip from '@/components/site/sections/trust-strip';

// Canonical alleen hier (niet in de layout: subpagina's zouden hem anders erven).
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <Problem />
      <HowItWorks />
      <Features />
      <Honest />
      <DashboardShowcase />
      <RoiCalculator />
      <Pricing />
      <LiveDemo />
      <Faq />
      <FinalCta />
    </>
  );
}
