'use client';

/**
 * EtheralShadowBackground — wrapper rond de bestaande EtheralShadow
 * SVG-filter background met exact dezelfde Caribbean Green tinted
 * props als die SignInCard pre-rotator gebruikte. Bestaat zodat
 * LoginBackground hem via `next/dynamic` kan laden (consistent met
 * de andere twee shader-varianten) en de visuele identiteit van de
 * oude login behouden blijft als 3e variant in de rotatie.
 *
 * Zie ./etheral-shadow.tsx voor de SVG-filter + motion/react animatie
 * zelf — die file is sinds iteratie 1 onveranderd gebleven.
 */

import { EtheralShadow } from './etheral-shadow';

export function EtheralShadowBackground() {
  return (
    <EtheralShadow
      color="color-mix(in oklab, #00CC9B 70%, #02151a)"
      animation={{ scale: 100, speed: 90 }}
      noise={{ opacity: 0.7, scale: 1.2 }}
      sizing="fill"
    />
  );
}
