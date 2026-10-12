'use client';

// Rondleiding van de demo, verteld door de mascotte (docs/site/MASCOTTE.md): hij zit op
// de uitlegkaart, kijkt eerst naar het onderdeel dat uitgelicht wordt en "spreekt" dan
// de tekst uit. Zijn mond volgt de klinkers en de woorden verschijnen in hetzelfde tempo.
// Klik op de tekst om hem in één keer te tonen. Reduced motion: tekst direct volledig.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { OnboardingTour, type TourStep } from '@/app/v0/klantendashboard/components/onboarding-tour';
import { MantaMascotte, type MascotteApi } from '@/components/site/mascotte/manta-mascotte';
import { useReducedMotion } from '@/components/site/ui/motion-hooks';

export function VoorbeeldTour({ steps, setupChecklistVisible }: { steps: TourStep[]; setupChecklistVisible: boolean }) {
  const [api, setApi] = useState<MascotteApi | null>(null);
  const onReady = useCallback((a: MascotteApi | null) => setApi(a), []);
  return (
    <OnboardingTour
      tourKey="voorbeeld"
      autoStart={false}
      steps={steps}
      setupChecklistVisible={setupChecklistVisible}
      narration={({ step, index, total }) => ({
        avatar: <MantaMascotte onReady={onReady} />,
        body: <NarratedText key={index} text={step.body} selector={step.selector} api={api} last={index === total - 1} />,
      })}
    />
  );
}

function NarratedText({
  text,
  selector,
  api,
  last,
}: {
  text: string;
  selector: string | null;
  api: MascotteApi | null;
  last: boolean;
}) {
  const reduce = useReducedMotion();
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const [shown, setShown] = useState(0);
  const all = words.length;

  useEffect(() => {
    if (reduce) {
      setShown(all);
      return;
    }
    if (!api) {
      // Mascotte (nog) niet geladen: niet eindeloos op een lege kaart wachten.
      const t = setTimeout(() => setShown(all), 1500);
      return () => clearTimeout(t);
    }
    let cancelled = false;
    setShown(0);
    const target = selector ? document.querySelector(selector) : null;
    if (target) api.lookAt(target, 900); // eerst kijken waar het over gaat
    const t = setTimeout(
      () => {
        if (cancelled) return;
        api.speak(text, {
          onWord: (i) => setShown(i + 1),
          onEnd: () => {
            setShown(all);
            if (last) {
              api.setMode('happy');
              api.wink();
            }
          },
        });
      },
      target ? 750 : 350,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
      api.stop();
      api.setMode(null);
    };
  }, [api, text, selector, last, reduce, all]);

  const skip = () => {
    api?.stop();
    setShown(all);
  };

  return (
    <span onClick={shown < all ? skip : undefined} style={{ cursor: shown < all ? 'pointer' : undefined }}>
      {words.map((w, i) => (
        <span key={i} style={{ opacity: i < shown ? 1 : 0, transition: 'opacity 120ms linear' }}>
          {w}
          {i < all - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}
