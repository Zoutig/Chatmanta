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

export function DigitalPetalsShader() {
  const containerRef = useRef<HTMLDivElement>(null);

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

    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const timer = new THREE.Timer();

    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    // Caribbean Green palette:
    //  color1         = #00CC9B (Caribbean primary)
    //  color2         = #024D50 (Dark Teal — voor diepte/voorgrond)
    //  highlightColor = #80fff0 (lichte teal-cyan ipv puur wit)
    const fragmentShader = `
      precision highp float;
      uniform vec2 iResolution;
      uniform float iTime;
      uniform vec2 iMouse;

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

        float petals     = 5.0 + sin(t) * 2.0;
        float petalShape = sin(a * petals + r * 2.0);
        petalShape = pow(abs(petalShape), 0.5);

        float flow    = sin(r * 10.0 - t * 2.0);
        float pattern = mix(petalShape, flow, 0.5) + bloom * 0.5;

        vec3 color1         = vec3(0.0, 0.80, 0.61);
        vec3 color2         = vec3(0.01, 0.31, 0.31);
        vec3 highlightColor = vec3(0.50, 1.0, 0.94);

        vec3 finalColor = mix(
          color1,
          color2,
          smoothstep(0.5, 0.8, r + random(vec2(t, t)) * 0.1)
        ) * pattern;

        finalColor += highlightColor * pow(pattern, 10.0) * (1.0 + bloom);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector2() },
      iMouse: {
        value: new THREE.Vector2(
          container.clientWidth / 2,
          container.clientHeight / 2,
        ),
      },
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
    };
  }, []);

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
