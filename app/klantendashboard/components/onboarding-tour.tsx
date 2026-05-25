'use client';

// Korte interactieve rondleiding voor (nieuwe) klanten. Licht stap-voor-stap de
// belangrijkste plekken van het dashboard uit met een spotlight + popover.
//
// - Start automatisch bij het eerste bezoek per org (localStorage seen-flag,
//   zelfde gedachte als DismissibleBanner). Daarna stil tot je 'm opnieuw start.
// - Herstartbaar via een custom window-event (START_TOUR_EVENT) — zie
//   start-tour-button.tsx.
// - Bewust GEEN portal naar document.body: de --klant-* theme-tokens zijn op de
//   dashboard-root gescoped, dus we renderen inline. `position: fixed` dekt
//   alsnog het hele scherm.
// - Targets worden op bestaande DOM gevonden via CSS-selector (sidebar-links
//   bestaan al), dus er is geen wijziging aan de sidebar nodig.

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Btn } from './ui/btn';

type Placement = 'right' | 'bottom' | 'center';

export type TourStep = {
  /** CSS-selector van het uit te lichten element, of null voor een gecentreerde kaart. */
  selector: string | null;
  title: string;
  body: string;
  placement: Placement;
};

export const START_TOUR_EVENT = 'klant:start-tour';
const SEEN_PREFIX = 'klant-tour-seen:';
const POPOVER_WIDTH = 320;

const DEFAULT_STEPS: TourStep[] = [
  {
    selector: null,
    placement: 'center',
    title: 'Welkom bij ChatManta 👋',
    body: 'In een paar stappen laten we zien waar alles staat. Je kunt de rondleiding altijd overslaan.',
  },
  {
    selector: 'a[href="/klantendashboard/kennisbank"]',
    placement: 'right',
    title: 'Kennisbank',
    body: 'Hier voeg je je website en documenten toe. Dit is de kennis waaruit je chatbot put — zonder bronnen kan hij nog niets beantwoorden.',
  },
  {
    selector: 'a[href="/klantendashboard/test"]',
    placement: 'right',
    title: 'Test chatbot',
    body: 'Stel hier zelf vragen om te checken of de antwoorden kloppen, vóór je live gaat.',
  },
  {
    selector: 'a[href="/klantendashboard/widget"]',
    placement: 'right',
    title: 'Widget',
    body: 'Pas de kleuren aan en kopieer de code om de chatbot op je eigen website te zetten.',
  },
  {
    selector: '#setup-checklist',
    placement: 'bottom',
    title: 'Aan de slag',
    body: 'Volg deze checklist. Staat alles op groen, dan is je chatbot live!',
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Bepaal de fixed-position van de popover t.o.v. de target-rect. */
function popoverPosition(
  placement: Placement,
  rect: DOMRect | null,
): { top: number; left: number; transform?: string } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (placement === 'center' || !rect) {
    return { top: vh / 2, left: vw / 2, transform: 'translate(-50%, -50%)' };
  }

  const margin = 14;
  const estHeight = 200;

  if (placement === 'bottom') {
    return {
      top: clamp(rect.bottom + margin, 12, vh - estHeight - 12),
      left: clamp(rect.left, 12, vw - POPOVER_WIDTH - 12),
    };
  }

  // 'right' (sidebar-items). Valt terug naar onder de target als er rechts geen
  // ruimte is.
  if (rect.right + margin + POPOVER_WIDTH > vw - 12) {
    return {
      top: clamp(rect.bottom + margin, 12, vh - estHeight - 12),
      left: clamp(rect.left, 12, vw - POPOVER_WIDTH - 12),
    };
  }
  return {
    top: clamp(rect.top, 12, vh - estHeight - 12),
    left: rect.right + margin,
  };
}

export function OnboardingTour({
  tourKey,
  autoStart = true,
  steps = DEFAULT_STEPS,
  setupChecklistVisible = true,
}: {
  /** Per-org sleutel zodat de seen-flag per werkomgeving geldt. */
  tourKey: string;
  autoStart?: boolean;
  steps?: TourStep[];
  /** Of de "Aan de slag"-checklist op de pagina staat. Zodra alle setup-stappen
   *  voltooid zijn verbergt Overzicht die checklist; dan laten we de bijhorende
   *  tour-stap weg zodat hij niet als losse, doelloze kaart blijft hangen. */
  setupChecklistVisible?: boolean;
}) {
  const tourSteps = setupChecklistVisible
    ? steps
    : steps.filter((s) => s.selector !== '#setup-checklist');
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Auto-start bij eerste bezoek + luister naar het herstart-event.
  useEffect(() => {
    function start() {
      setIndex(0);
    }
    window.addEventListener(START_TOUR_EVENT, start);

    let seen = false;
    try {
      seen = window.localStorage.getItem(SEEN_PREFIX + tourKey) === '1';
    } catch {
      seen = false;
    }
    if (autoStart && !seen) setIndex(0);

    return () => window.removeEventListener(START_TOUR_EVENT, start);
  }, [tourKey, autoStart]);

  const step = index === null ? null : tourSteps[index] ?? null;

  // Meet de target-rect; herbereken bij stap-wissel, resize en scroll.
  useLayoutEffect(() => {
    if (!step || !step.selector) {
      setRect(null);
      return;
    }
    const selector = step.selector;
    function measure() {
      const el = document.querySelector(selector);
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      setRect(el.getBoundingClientRect());
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_PREFIX + tourKey, '1');
    } catch {
      // localStorage onbereikbaar → sluit alsnog voor deze sessie.
    }
    setIndex(null);
  }, [tourKey]);

  if (index === null || !step) return null;

  const total = tourSteps.length;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const spotlightOn = step.placement !== 'center' && !!step.selector && !!rect;
  const pos = popoverPosition(step.placement, rect);

  return (
    <div role="dialog" aria-modal="true" aria-label="Rondleiding">
      {/* Achtergrond — vangt kliks zodat je niet per ongeluk doorklikt. Dimt zelf
          alleen bij de gecentreerde stap; bij een spotlight-stap doet de
          spotlight-div de dimming via box-shadow. */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: spotlightOn ? 'transparent' : 'rgba(8, 12, 16, 0.55)',
          pointerEvents: 'auto',
        }}
      />

      {/* Spotlight — gat over de target via box-shadow-spread, met accent-rand. */}
      {spotlightOn && rect && (
        <div
          style={{
            position: 'fixed',
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 10,
            zIndex: 1001,
            pointerEvents: 'none',
            boxShadow: '0 0 0 9999px rgba(8, 12, 16, 0.55), 0 0 0 2px var(--klant-accent)',
            transition: 'top .18s ease, left .18s ease, width .18s ease, height .18s ease',
          }}
        />
      )}

      {/* Popover */}
      <div
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          transform: pos.transform,
          width: POPOVER_WIDTH,
          maxWidth: 'calc(100vw - 24px)',
          zIndex: 1002,
          background: 'var(--klant-surface)',
          border: '1px solid var(--klant-border)',
          borderRadius: 14,
          boxShadow: 'var(--klant-shadow), 0 18px 50px -16px rgba(8, 12, 16, 0.45)',
          padding: 18,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--klant-accent)',
            marginBottom: 8,
          }}
        >
          Stap {index + 1} van {total}
        </div>
        <h3
          style={{
            fontFamily: 'var(--klant-font-display)',
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--klant-ink)',
            margin: '0 0 6px',
            lineHeight: 1.2,
          }}
        >
          {step.title}
        </h3>
        <p
          style={{
            fontSize: 13.5,
            color: 'var(--klant-muted)',
            lineHeight: 1.5,
            margin: '0 0 16px',
          }}
        >
          {step.body}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={finish}>
            Overslaan
          </Btn>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {!isFirst && (
              <Btn variant="secondary" size="sm" onClick={() => setIndex(index - 1)}>
                Vorige
              </Btn>
            )}
            <Btn
              variant="primary"
              size="sm"
              onClick={() => (isLast ? finish() : setIndex(index + 1))}
            >
              {isLast ? 'Klaar' : 'Volgende'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
