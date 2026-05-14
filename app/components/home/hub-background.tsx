'use client';

/**
 * HubBackground — rustige variant van de login-shader voor /home.
 *
 * Verschillen t.o.v. <LoginBackground />:
 *   - Vaste variant (mesh) i.p.v. random per page-load. /home is een
 *     nav-hub, niet een welcome-moment — voorspelbaarheid > spektakel.
 *   - Lagere opacity-laag bovenop zodat de 4 cards primair onderwerp
 *     blijven en de shader achtergrond-textuur is, geen hoofdrol.
 *   - Iets donkerder kleurstops dan MeshGradientBackground (login)
 *     zodat tekst-contrast op de hub-cards royaler is.
 */

import { MeshGradient } from '@paper-design/shaders-react';
import { useAccent } from '@/lib/v0/hooks/use-accent';
import { getShaderPalette } from '@/lib/v0/shader-palette';

export function HubBackground() {
  const { accent } = useAccent();
  const palette = getShaderPalette(accent);
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      <MeshGradient
        className="absolute inset-0 w-full h-full"
        style={{ backgroundColor: '#02060c' }}
        colors={[...palette]}
        speed={0.35}
        distortion={0.6}
        swirl={0.25}
      />
      {/* Dimmer: shader oogt rustiger en cards krijgen meer focus.
          ~0.55 zwart → cards staan voor, achtergrond blijft sfeer. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(2,6,12,0.35) 0%, rgba(2,6,12,0.75) 70%, rgba(2,6,12,0.92) 100%)',
        }}
      />
    </div>
  );
}
