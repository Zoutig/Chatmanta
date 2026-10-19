'use client';

// Eenmalig succesmoment op Overzicht: "Je chatbot staat live", zodra de widget
// voor het eerst echt op de site gezien is (widgetStatus 'active' = heartbeat +
// aan). Rustig: één navy blok met de stilstaande mascotte 'blij', één zin en een
// sluitknop. Geen animatie. Na sluiten nooit meer (localStorage-vlag per org).
// Zonder localStorage (privévenster, geblokkeerd) verdwijnt het na sluiten alleen
// voor deze sessie; dat is acceptabel.

import { useSyncExternalStore } from 'react';
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

export function LiveMoment({ orgId }: { orgId: string }) {
  // Server-snapshot = "al gezien" → niets renderen tot na hydratie (geen flits).
  const seen = useSyncExternalStore(
    subscribe,
    () => isSeen(orgId),
    () => true,
  );
  if (seen) return null;

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
      <button type="button" className="v1-ov-live-close" onClick={() => markSeen(orgId)} aria-label="Sluiten">
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
