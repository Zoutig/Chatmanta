'use client';

import { useEffect, useState } from 'react';
import { MantaMascotte } from '../../mascotte/manta-mascotte';

// TIJDELIJK (testfase): ?mascotte=boven|groot|zij kiest een plaatsingsvariant om te vergelijken.
// Vóór de PR terugbrengen naar één vaste plaatsing.
const VARIANTS = ['boven', 'groot', 'zij'] as const;
type Variant = (typeof VARIANTS)[number];

export function HeroMascotte() {
  const [variant, setVariant] = useState<Variant>('boven');
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('mascotte');
    if (v && (VARIANTS as readonly string[]).includes(v)) setVariant(v as Variant);
  }, []);
  return <MantaMascotte className={`hero-mascotte v-${variant}`} />;
}
