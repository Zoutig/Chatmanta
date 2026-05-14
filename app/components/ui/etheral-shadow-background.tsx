'use client';

/**
 * EtheralShadowBackground — wrapper rond de bestaande EtheralShadow
 * SVG-filter background. Kleurt mee met de gekozen accent via
 * useAccent(): de accent-tint wordt gemixt met de donkerste palette-
 * stop van diezelfde accent zodat de schaduw natuurlijk integreert
 * met de andere shader-varianten.
 *
 * Zie ./etheral-shadow.tsx voor de SVG-filter + motion/react animatie
 * zelf — die file is sinds iteratie 1 onveranderd gebleven.
 */

import { EtheralShadow } from './etheral-shadow';
import { useAccent } from '@/lib/v0/hooks/use-accent';
import { getShaderPalette } from '@/lib/v0/shader-palette';

export function EtheralShadowBackground() {
  const { accent } = useAccent();
  const palette = getShaderPalette(accent);
  return (
    <EtheralShadow
      color={`color-mix(in oklab, ${accent} 70%, ${palette[0]})`}
      animation={{ scale: 100, speed: 90 }}
      noise={{ opacity: 0.7, scale: 1.2 }}
      sizing="fill"
    />
  );
}
