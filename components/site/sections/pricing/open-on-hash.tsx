'use client';

import { useEffect } from 'react';

/**
 * Klapt een <details> open als de URL-hash ernaar wijst (bv. `/#rekenhulp`). Zonder dit
 * scrollt een gedeelde link alleen naar een dichte uitklapper. Rendert niets; zonder JS
 * blijft het gewone anker-gedrag (scrollen naar de dichte <details>) over.
 */
export function OpenOnHash({ id }: { id: string }) {
  useEffect(() => {
    const check = () => {
      if (window.location.hash !== `#${id}`) return;
      const el = document.getElementById(id);
      if (!(el instanceof HTMLDetailsElement)) return;
      el.open = true;
      el.scrollIntoView({ block: 'start' });
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [id]);
  return null;
}
