'use client';

// V0 Klantendashboard — Preview Chatbot: het "browser-venster" met backdrop.
//
// Een `position: relative` ingelijst vlak (faux browser-chrome met adresbalk)
// dat de échte homepage-screenshot van de klant-site als sfeer-backdrop toont,
// met de PreviewWidget (FAB + chat-paneel) er absoluut overheen in de hoek.
//
// Screenshot-resolutie (kosten-bewust):
//   1. op mount: getWidgetPreviewAction() — leest alleen de cache, GEEN capture.
//   2. cache-miss (null) → captureWidgetPreviewAction() ÉÉN keer (ref-guard),
//      met een subtiele "voorbeeld laden…"-state. Die action is billable maar
//      cachet daarna, en geeft null bij ontbrekende URL of capture-fout.
//   3. nog steeds null → val terug op een nette lege mockup-backdrop.
//
// De widget zelf is `position: absolute` binnen dit relatieve vlak en kan dus
// nooit naar de echte viewport ontsnappen (hard requirement).

import { useEffect, useRef, useState } from 'react';
import {
  getWidgetPreviewAction,
  captureWidgetPreviewAction,
} from '../../actions';
import { PreviewWidget } from './preview-widget';
import type { WidgetSettings } from '@/lib/v0/klantendashboard/types';

type BackdropState =
  | { phase: 'loading' }
  | { phase: 'screenshot'; url: string }
  | { phase: 'mockup' };

export function PreviewFrame({
  orgSlug,
  botVersion,
  welcomeMessage,
  starterQuestions,
  widget,
  chatbotName,
  websiteHost,
}: {
  orgSlug: string;
  botVersion: string;
  welcomeMessage: string;
  starterQuestions: string[];
  widget: WidgetSettings;
  chatbotName: string;
  /** Leesbare host voor de faux-adresbalk (bv. "voorbeeldbedrijf.nl"). */
  websiteHost: string;
}) {
  const [backdrop, setBackdrop] = useState<BackdropState>({ phase: 'loading' });
  // Guard zodat de (billable) capture maar één keer afgaat, ook bij re-renders
  // of een dubbele effect-run in React StrictMode (dev).
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;

    let cancelled = false;
    (async () => {
      // 1. Cache-read (gratis, geen Firecrawl-call). ActionResult drukt de data
      //    plat op de ok-branch (zie lib/errors/action.ts) → `res.url`.
      const cachedRes = await getWidgetPreviewAction();
      const cachedUrl = cachedRes.ok ? cachedRes.url : null;
      if (cancelled) return;
      if (cachedUrl) {
        setBackdrop({ phase: 'screenshot', url: cachedUrl });
        return;
      }

      // 2. Cache-miss → één billable capture-poging (server cachet het resultaat).
      const capturedRes = await captureWidgetPreviewAction();
      const capturedUrl = capturedRes.ok ? capturedRes.url : null;
      if (cancelled) return;
      // 3. Nog steeds geen URL (geen website / capture-fout) → mockup.
      setBackdrop(capturedUrl ? { phase: 'screenshot', url: capturedUrl } : { phase: 'mockup' });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const addressLabel = websiteHost || 'jouw-website.nl';

  return (
    <div
      className="klant-card"
      style={{
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        // Vaste, browser-achtige verhouding zodat de FAB-hoek voorspelbaar zit.
        minHeight: 560,
      }}
    >
      {/* Faux browser-chrome — verkeerslichten + adresbalk. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderBottom: '1px solid var(--klant-border)',
          background: 'var(--klant-surface-muted)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 6 }} aria-hidden="true">
          <span style={{ width: 11, height: 11, borderRadius: 999, background: '#ff5f57' }} />
          <span style={{ width: 11, height: 11, borderRadius: 999, background: '#febc2e' }} />
          <span style={{ width: 11, height: 11, borderRadius: 999, background: '#28c840' }} />
        </div>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--klant-bg)',
            border: '1px solid var(--klant-border)',
            borderRadius: 999,
            padding: '5px 12px',
            fontSize: 12,
            color: 'var(--klant-muted)',
            fontFamily: 'var(--klant-font-mono)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          https://{addressLabel}
        </div>
      </div>

      {/* Backdrop-vlak — `position: relative`; de widget hangt hier absoluut in. */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          background: 'var(--klant-bg)',
        }}
      >
        {backdrop.phase === 'screenshot' ? (
          // eslint-disable-next-line @next/next/no-img-element -- runtime Storage-URL, niet door next/image te optimizen.
          <img
            src={backdrop.url}
            alt="Screenshot van je website"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'top center',
            }}
          />
        ) : (
          <MockupSite loading={backdrop.phase === 'loading'} host={addressLabel} />
        )}

        {/* Lichte sluier zodat de widget altijd leesbaar boven de backdrop ligt. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(255,255,255,0) 55%, rgba(15,17,21,0.06) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* De contained widget — FAB + paneel, absoluut binnen dit vlak. */}
        <PreviewWidget
          orgSlug={orgSlug}
          botVersion={botVersion}
          welcomeMessage={welcomeMessage}
          starterQuestions={starterQuestions}
          widget={widget}
          chatbotName={chatbotName}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lege "website"-mockup — backdrop wanneer er geen screenshot is (geen website-
// URL, capture mislukt, of nog aan het laden). Een smaakvol leeg frame met een
// faux nav + hero + content-blokjes zodat de widget altijd op "een site" lijkt
// te staan, ook zonder echte screenshot.
// ---------------------------------------------------------------------------
function MockupSite({ loading, host }: { loading: boolean; host: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        padding: '0 0 40px',
        background:
          'linear-gradient(180deg, var(--klant-surface) 0%, var(--klant-bg) 100%)',
      }}
    >
      {/* Faux site-nav */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 28px',
          borderBottom: '1px solid var(--klant-border)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--klant-font-display)',
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--klant-ink-soft)',
          }}
        >
          {host}
        </div>
        <div style={{ display: 'flex', gap: 18 }} aria-hidden="true">
          {[60, 48, 52].map((w, i) => (
            <span
              key={i}
              style={{ width: w, height: 9, borderRadius: 999, background: 'var(--klant-border-strong)' }}
            />
          ))}
        </div>
      </div>

      {/* Faux hero */}
      <div style={{ padding: '40px 28px 0', maxWidth: 520 }} aria-hidden="true">
        <span
          style={{
            display: 'block',
            width: '70%',
            height: 26,
            borderRadius: 8,
            background: 'var(--klant-surface-deep)',
            marginBottom: 14,
          }}
        />
        <span
          style={{
            display: 'block',
            width: '90%',
            height: 12,
            borderRadius: 6,
            background: 'var(--klant-border-strong)',
            marginBottom: 8,
          }}
        />
        <span
          style={{
            display: 'block',
            width: '60%',
            height: 12,
            borderRadius: 6,
            background: 'var(--klant-border-strong)',
          }}
        />
      </div>

      {/* Faux content-kaarten */}
      <div
        style={{ display: 'flex', gap: 16, padding: '36px 28px 0', flexWrap: 'wrap' }}
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              flex: '1 1 140px',
              minWidth: 120,
              height: 96,
              borderRadius: 12,
              background: 'var(--klant-surface)',
              border: '1px solid var(--klant-border)',
            }}
          />
        ))}
      </div>

      {/* Status-label — onopvallend, midden-onder. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 16,
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--klant-dim)',
        }}
      >
        {loading ? 'Voorbeeld laden…' : 'Voorbeeldweergave van je website'}
      </div>
    </div>
  );
}
