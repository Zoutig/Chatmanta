'use client';

/**
 * Digital Petals — pure three.js fragment shader. Bron: 21st.dev
 * `digital-petals-shader`, aangepast:
 * - Kleuren omgezet van paars/blauw naar Caribbean Green palette
 *   (#00CC9B → #024D50 → #80fff0 highlight) zodat het matcht met de
 *   bestaande Manta-login branding.
 * - JS → TypeScript met expliciete types.
 * - `position: fixed; 100vw/100vh; zIndex: -1` → `position: absolute;
 *   inset-0` zodat het in de bestaande `<div className="absolute
 *   inset-0">` wrapper van SignInCard past (anders dekt het de hele
 *   viewport af inclusief content).
 * - Mouse-coords genormaliseerd via `getBoundingClientRect()` ipv
 *   directe `window.innerWidth/Height` — werkt ook als de parent
 *   kleiner is dan viewport.
 * - WebGL-fallback: bij ontbrekende WebGL-support stille no-op
 *   (parent's `#02060c` bg blijft zichtbaar).
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAccent } from '@/lib/v0/hooks/use-accent';
import { getShaderPalette, hexToRgb01 } from '@/lib/v0/shader-palette';

export function DigitalPetalsShader() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { accent } = useAccent();
  // Houd uniforms in een ref zodat de accent-watcher hieronder ze kan
  // bijwerken zonder de WebGL-init opnieuw te draaien.
  const colorUniformsRef = useRef<{
    uColor1: { value: THREE.Vector3 };
    uColor2: { value: THREE.Vector3 };
    uHighlight: { value: THREE.Vector3 };
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // WebGL availability check — fail silent, parent bg blijft zichtbaar
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }

    // Cap pixel ratio op 2 — op high-DPI displays kan een te hoge ratio
    // sub-pixel aliasing geven die als flicker oogt.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const timer = new THREE.Timer();

    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    // Kleuren zijn nu accent-volgend via uniforms (uColor1 = accent,
    // uColor2 = midtone, uHighlight = highlight uit getShaderPalette).
    const fragmentShader = `
      precision highp float;
      uniform vec2 iResolution;
      uniform float iTime;
      uniform vec2 iMouse;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uHighlight;

      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      void main() {
        vec2 uv    = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
        vec2 mouse = (iMouse      - 0.5 * iResolution.xy) / iResolution.y;

        float t = iTime * 0.3;

        float r = length(uv);
        float a = atan(uv.y, uv.x);

        float mouseDist = length(uv - mouse);
        float bloom     = smoothstep(0.4, 0.0, mouseDist);

        // Petals MOET een even integer zijn anders ontstaat er een
        // verticale naad op de negatieve x-as (atan(y,x) springt daar
        // van +pi naar -pi en sin(a*petals) is alleen continu over
        // die wrap als petals * pi een geheel veelvoud van pi is).
        // Pulse 50/50 tussen 4 en 6 via step(0, sin(t)).
        float petals     = 4.0 + 2.0 * step(0.0, sin(t));
        float petalShape = sin(a * petals + r * 2.0);
        petalShape = pow(abs(petalShape), 0.5);

        float flow    = sin(r * 10.0 - t * 2.0);
        float pattern = mix(petalShape, flow, 0.5) + bloom * 0.5;

        vec3 color1         = uColor1;
        vec3 color2         = uColor2;
        vec3 highlightColor = uHighlight;

        // Spatial random (per pixel, niet per frame) — tijd-variërende
        // noise op een smoothstep-grens veroorzaakte zichtbare flicker
        // omdat elk pixel dicht bij de threshold per frame tussen
        // color1/color2 sprong.
        vec3 finalColor = mix(
          color1,
          color2,
          smoothstep(0.5, 0.8, r + random(uv * 50.0) * 0.1)
        ) * pattern;

        finalColor += highlightColor * pow(pattern, 10.0) * (1.0 + bloom);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    // Initiële kleuren — `accent` uit closure (eerste mount). Volgende
    // wijzigingen lopen via de accent-watcher useEffect verderop, die
    // alleen de uniforms muteert (geen re-init van WebGL).
    const initialPalette = getShaderPalette(accent);
    const uColor1 = { value: new THREE.Vector3(...hexToRgb01(accent)) };
    const uColor2 = {
      value: new THREE.Vector3(...hexToRgb01(initialPalette[1])),
    };
    const uHighlight = {
      value: new THREE.Vector3(...hexToRgb01(initialPalette[4])),
    };
    colorUniformsRef.current = { uColor1, uColor2, uHighlight };

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector2() },
      iMouse: {
        value: new THREE.Vector2(
          container.clientWidth / 2,
          container.clientHeight / 2,
        ),
      },
      uColor1,
      uColor2,
      uHighlight,
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const onResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      uniforms.iResolution.value.set(width, height);
    };
    window.addEventListener('resize', onResize);
    onResize();

    const onMouseMove = (e: MouseEvent) => {
      // mouse-coord relatief aan container, Y geflipt (shader-origin is bottom-left)
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = rect.height - (e.clientY - rect.top);
      uniforms.iMouse.value.set(x, y);
    };
    window.addEventListener('mousemove', onMouseMove);

    renderer.setAnimationLoop(() => {
      timer.update();
      uniforms.iTime.value = timer.getElapsed();
      renderer.render(scene, camera);
    });

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      renderer.setAnimationLoop(null);
      const canvas = renderer.domElement;
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
      material.dispose();
      geometry.dispose();
      renderer.dispose();
      colorUniformsRef.current = null;
    };
    // accent wordt expres uit deze deps gehouden — de accent-watcher
    // hieronder muteert de uniform-values rechtstreeks zodat WebGL niet
    // opnieuw geïnitialiseerd hoeft te worden bij een kleurwissel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Accent-watcher: bij wissel, schrijf de nieuwe RGB-waardes direct
  // naar de bestaande uniform-Vector3s. De animation-loop pakt ze in
  // de volgende frame op zonder material-rebuild.
  useEffect(() => {
    const u = colorUniformsRef.current;
    if (!u) return;
    const palette = getShaderPalette(accent);
    const [r1, g1, b1] = hexToRgb01(accent);
    const [r2, g2, b2] = hexToRgb01(palette[1]);
    const [r3, g3, b3] = hexToRgb01(palette[4]);
    u.uColor1.value.set(r1, g1, b1);
    u.uColor2.value.set(r2, g2, b2);
    u.uHighlight.value.set(r3, g3, b3);
  }, [accent]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
