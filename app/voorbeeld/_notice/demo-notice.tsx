'use client';

// Intro-melding voor de hele publieke demo (/voorbeeld: dashboard én voorbeeldwebsite):
// "Dit is een fictief voorbeeld". Eén keer per tab-sessie (sessionStorage, gedeeld over
// dashboard en website). Zonder opslag (privévenster, geblokkeerd) verschijnt hij bij
// elke pageload; dat is acceptabel en de pagina werkt gewoon.
//
// Native <dialog> + showModal (patroon van app/v1/leads/_ui/dialoog.tsx): echte
// focus-trap, Esc sluit, achtergrond inert, en de top layer ligt boven de demo-widget
// (z-index 2147483000) en de rondleiding. De rondleiding start alleen via de knop
// 'Rondleiding' (autoStart=false); die is onbereikbaar zolang de melding open staat.
//
// Mascotte: een still (design/mascotte/stills/blij.png) op een navy vlak, zoals
// docs/site/MASCOTTE.md vraagt; bewust geen tweede animerende mascotte naast die van
// de rondleiding.

import './demo-notice.css';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { v1Font } from '@/app/v1/_ui/fonts';
import { ROUTES } from '@/lib/site/navigation';
import { readNoticeSeen, writeNoticeSeen } from '@/lib/voorbeeld/demo-notice-storage';

export function DemoNotice() {
  // Server-snapshot = 'gezien': de server rendert niets, dus geen hydratieverschil;
  // pas in de browser wordt sessionStorage gelezen. 'dismissed' dekt geblokkeerde opslag.
  const seen = useSyncExternalStore(noSubscribe, readSeenInBrowser, () => true);
  const [dismissed, setDismissed] = useState(false);
  const open = !seen && !dismissed;
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d || !open || d.open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    d.showModal(); // focust de eerste knop ('Bekijk het voorbeeld')
  }, [open]);

  function close() {
    ref.current?.close(); // → onClose → afronden
  }

  function onClosed() {
    writeNoticeSeen(safeSessionStorage());
    setDismissed(true);
    const back = returnFocus.current;
    if (back && back.isConnected && back !== document.body) back.focus();
  }

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={`vbn ${v1Font.variable}`}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClose={onClosed}
      // Klik op de achtergrond (buiten de kaart) sluit ook.
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="vbn-card">
        <div className="vbn-stage" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- kleine vaste still, geen optimalisatie nodig */}
          <img src="/voorbeeld/mascotte-blij.png" alt="" width={192} height={128} decoding="async" />
        </div>
        <div className="vbn-body">
          <p className="vbn-eyebrow">Voorbeeld</p>
          <h2 id={titleId} className="vbn-title">
            Dit is een fictief voorbeeld
          </h2>
          <p id={bodyId} className="vbn-text">
            Vakantiepark De Helmduin bestaat niet. De website en het dashboard zijn verzonnen, zodat je kunt zien
            hoe ChatManta voor een klant werkt: de chatbot op de website en het dashboard erachter. De chatbot zelf
            is wel echt, dus stel hem gerust een vraag.
          </p>
          <div className="vbn-actions">
            <button type="button" className="vbn-primary" onClick={close}>
              Bekijk het voorbeeld
            </button>
            <a className="vbn-secondary" href={ROUTES.home} onClick={() => writeNoticeSeen(safeSessionStorage())}>
              Terug naar chatmanta.nl
            </a>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function noSubscribe() {
  return () => {};
}

function readSeenInBrowser() {
  return readNoticeSeen(safeSessionStorage());
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
