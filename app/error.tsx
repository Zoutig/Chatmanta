'use client';

// Next.js error boundary voor de hele app. Vangt onverwachte server- en
// client-side crashes en toont een vriendelijke fallback met de Next-`digest`
// als pseudo-correlation-ID. Zonder deze file valt Next.js terug op zijn
// eigen kale dev-overlay / 500-pagina.

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error.tsx]', error);
  }, [error]);

  return (
    <div className="app-error-page">
      <div className="app-error-card">
        <span className="app-error-label">Fout</span>
        <h1 className="app-error-title">Er ging iets onverwachts mis</h1>
        <p className="app-error-body">
          We konden deze pagina niet laden. Probeer het opnieuw — als het blijft fout
          gaan, ververs de hele pagina of laat het ons weten met de ID hieronder.
        </p>
        <div className="app-error-actions">
          <button type="button" className="app-error-retry" onClick={reset}>
            Probeer opnieuw
          </button>
          {error.digest ? (
            <span className="app-error-id">ID: {error.digest}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
