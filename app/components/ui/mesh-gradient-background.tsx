'use client';

/**
 * MeshGradient achtergrond — vloeiende kleurmix in Caribbean Green
 * palette. Wrapper rond `@paper-design/shaders-react` MeshGradient.
 *
 * Kleuren: donker → licht (#02151a → #80fff0) zodat de mix natuurlijk
 * van diepte naar highlight beweegt. Match met de hardcoded
 * Caribbean Green branding in SignInCard (logo + submit button).
 *
 * `speed`/`distortion`/`swirl` zijn rustig getuned (matcht het
 * tempo van de andere login-animaties).
 */

import { MeshGradient } from '@paper-design/shaders-react';

export function MeshGradientBackground() {
  return (
    <MeshGradient
      className="absolute inset-0 w-full h-full"
      style={{ backgroundColor: '#02060c' }}
      colors={['#02151a', '#024D50', '#009292', '#00CC9B', '#80fff0']}
      speed={0.6}
      distortion={0.8}
      swirl={0.3}
    />
  );
}
