'use client';

/**
 * MeshGradient achtergrond — vloeiende 5-stop mix die de gekozen
 * accent-kleur volgt (Caribbean Green / Common Teal / Crystal Teal /
 * Dark Teal). Stops komen uit `getShaderPalette(accent)`: donker →
 * midtone → accent → highlight, allemaal binnen dezelfde teal-familie.
 *
 * `speed`/`distortion`/`swirl` zijn rustig getuned (matcht het
 * tempo van de andere login-animaties).
 */

import { MeshGradient } from '@paper-design/shaders-react';
import { useAccent } from '@/lib/v0/hooks/use-accent';
import { getShaderPalette } from '@/lib/v0/shader-palette';

export function MeshGradientBackground() {
  const { accent } = useAccent();
  const colors = getShaderPalette(accent);
  return (
    <MeshGradient
      className="absolute inset-0 w-full h-full"
      style={{ backgroundColor: '#02060c' }}
      colors={[...colors]}
      speed={0.6}
      distortion={0.8}
      swirl={0.3}
    />
  );
}
