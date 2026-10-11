'use client';

// Wrapt WarningBanner met wegklik-gedrag dat per banner een "signature" in
// localStorage bewaart. Komt de signature later niet meer overeen (bijv. omdat
// er een nieuwe onbeantwoorde vraag is bijgekomen), dan verschijnt de banner
// opnieuw. Past bij V0: geen per-user identiteit, dus client-side opslag is hier
// het juiste niveau.

import { useEffect, useState } from 'react';
import { WarningBanner } from './warning-banner';

type Variant = 'warning' | 'info' | 'success';

const KEY_PREFIX = 'klant-banner-dismiss:';

export function DismissibleBanner({
  dismissId,
  signature,
  variant,
  title,
  message,
  cta,
}: {
  /** Stabiele sleutel per banner-type, bv. "unanswered". */
  dismissId: string;
  /** Verandert wanneer de onderliggende situatie verandert (count/timestamp). */
  signature: string;
  variant?: Variant;
  title: string;
  message: string;
  cta?: { label: string; href: string };
}) {
  // Start verborgen tot useEffect localStorage heeft gelezen — voorkomt dat een
  // al-weggeklikte banner kort in beeld flitst na hydration.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY_PREFIX + dismissId);
      setVisible(stored !== signature);
    } catch {
      // localStorage onbereikbaar (private mode e.d.) → gewoon tonen.
      setVisible(true);
    }
  }, [dismissId, signature]);

  function dismiss() {
    try {
      window.localStorage.setItem(KEY_PREFIX + dismissId, signature);
    } catch {
      // Opslaan mislukt → banner sluit alsnog visueel voor deze sessie.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <WarningBanner
      variant={variant}
      title={title}
      message={message}
      cta={cta}
      onDismiss={dismiss}
    />
  );
}
