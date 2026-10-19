'use client';

// Eenmalig succesmoment op Overzicht: "Je chatbot staat live", zodra de widget
// voor het eerst echt op de site gezien is (widgetStatus 'active' = heartbeat +
// aan). Rustig: één navy blok met de stilstaande mascotte 'blij', één zin en een
// sluitknop. Geen animatie. Na sluiten nooit meer (localStorage-vlag per org).
// Zonder localStorage (privévenster, geblokkeerd) verdwijnt het na sluiten alleen
// voor deze sessie; dat is acceptabel.

import { useSyncExternalStore, type ReactNode } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';

const keyFor = (orgId: string) => `klant-v1-live-moment-seen:${orgId}`;

// Sessie-geheugen als localStorage niet werkt.
const memory = new Set<string>();
const listeners = new Set<() => void>();

function isSeen(orgId: string): boolean {
  if (memory.has(orgId)) return true;
  try {
    return window.localStorage.getItem(keyFor(orgId)) === '1';
  } catch {
    return false;
  }
}

function markSeen(orgId: string): void {
  memory.add(orgId);
  try {
    window.localStorage.setItem(keyFor(orgId), '1');
  } catch {
    // localStorage onbereikbaar: alleen voor deze sessie onthouden.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

/** Na sluiten: focus naar de paginakop, zodat toetsenbord/screenreader niet op <body> belandt. */
function focusPageHeading(): void {
  const h = document.querySelector<HTMLElement>('.v1-page h1');
  if (!h) return;
  if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
  h.focus();
}

/**
 * `fallback` = wat in dit slot staat als het moment al gezien is (het
 * volgende-stap-blok, of niets). Zo staat er altijd hooguit één blok bovenaan,
 * ook als de setup-stappen nog niet allemaal af zijn.
 */
export function LiveMoment({ orgId, fallback = null }: { orgId: string; fallback?: ReactNode }) {
  // Server-snapshot = "al gezien" → de fallback renderen tot na hydratie; wie het
  // moment al zag, krijgt zo geen flits.
  const seen = useSyncExternalStore(
    subscribe,
    () => isSeen(orgId),
    () => true,
  );
  if (seen) return <>{fallback}</>;

  return (
    <section className="v1-ov-live" aria-labelledby="v1-ov-live-title">
      <Image
        src="/site/mascotte/still-blij.png"
        alt=""
        aria-hidden="true"
        width={180}
        height={120}
        className="v1-ov-live-manta"
      />
      <div className="v1-ov-live-main">
        <h2 id="v1-ov-live-title" className="v1-ov-live-title">
          Je chatbot staat live
        </h2>
        <p className="v1-ov-live-text">We zien hem op je website. Vanaf nu beantwoordt hij vragen van je bezoekers.</p>
      </div>
      <button
        type="button"
        className="v1-ov-live-close"
        onClick={() => {
          markSeen(orgId);
          focusPageHeading();
        }}
        aria-label='Melding "Je chatbot staat live" sluiten'
      >
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
