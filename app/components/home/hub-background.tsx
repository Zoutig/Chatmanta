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
 *   - Theme-aware: mesh-palette + dim-overlay switchen mee met de
 *     light/dark-keuze uit `useTheme()`.
 */

import { MeshGradient } from '@paper-design/shaders-react';
import { useAccent } from '@/lib/v0/hooks/use-accent';
import { useTheme } from '@/lib/v0/hooks/use-theme';
import { getShaderPalette } from '@/lib/v0/shader-palette';

export function HubBackground() {
  const { accent } = useAccent();
  const { resolved } = useTheme();
  const isLight = resolved === 'light';
  const palette = getShaderPalette(accent, resolved);

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      <MeshGradient
        className="absolute inset-0 w-full h-full"
        style={{ backgroundColor: isLight ? '#f4f7fa' : '#02060c' }}
        colors={[...palette]}
        speed={0.35}
        distortion={0.6}
        swirl={0.25}
      />
      {/* Dimmer: shader oogt rustiger en cards krijgen meer focus.
          Dark = warm zwart (~0.55). Light = zachte witte wash zodat
          de pastel-mesh net iets vervaagt en de cards leesbaar blijven. */}
      <div
        className="absolute inset-0"
        style={{
          background: isLight
            ? 'radial-gradient(ellipse at center, rgba(244,247,250,0.10) 0%, rgba(244,247,250,0.45) 70%, rgba(244,247,250,0.70) 100%)'
            : 'radial-gradient(ellipse at center, rgba(2,6,12,0.35) 0%, rgba(2,6,12,0.75) 70%, rgba(2,6,12,0.92) 100%)',
        }}
      />
    </div>
  );
}
