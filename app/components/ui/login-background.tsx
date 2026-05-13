'use client';

/**
 * LoginBackground — kiest één shader-variant per page-load uit een
 * pool en rendert die als fullbleed achtergrond. Vervangt de oude
 * single `EtheralShadow` op /login zodat de pagina elke reload
 * speelser oogt zonder de Caribbean Green branding te breken.
 *
 * Hydration-strategie: beide shader-componenten worden client-only
 * geladen via `next/dynamic` met `ssr: false`. De server rendert dus
 * `null` voor de gekozen variant en de daadwerkelijke WebGL-init
 * gebeurt sowieso pas na hydration. Vermijdt:
 *  - server/client variant-mismatch (Math.random verschilt)
 *  - SSR-uitvoering van three.js (kost niets, want client-only)
 *
 * Pool uitbreiden: voeg variant-id toe aan VARIANTS + één lookup-entry
 * onderaan.
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';

const DigitalPetalsShader = dynamic(
  () =>
    import('./digital-petals-shader').then((m) => ({
      default: m.DigitalPetalsShader,
    })),
  { ssr: false },
);

const MeshGradientBackground = dynamic(
  () =>
    import('./mesh-gradient-background').then((m) => ({
      default: m.MeshGradientBackground,
    })),
  { ssr: false },
);

const EtheralShadowBackground = dynamic(
  () =>
    import('./etheral-shadow-background').then((m) => ({
      default: m.EtheralShadowBackground,
    })),
  { ssr: false },
);

const VARIANTS = ['mesh', 'petals', 'etheral'] as const;
type Variant = (typeof VARIANTS)[number];

function pick(): Variant {
  return VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
}

export function LoginBackground() {
  // useState init-fn draait 1× per mount. SSR kiest mogelijk variant A,
  // client variant B — maar omdat alle kinderen via dynamic({ssr:false})
  // server-side `null` zijn, ontstaat er geen DOM-mismatch.
  const [variant] = useState<Variant>(pick);

  if (variant === 'petals') return <DigitalPetalsShader />;
  if (variant === 'etheral') return <EtheralShadowBackground />;
  return <MeshGradientBackground />;
}
