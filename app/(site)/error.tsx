'use client';

// Foutgrens voor de marketingsite (eigen root layout, dus niet de app-foutpagina
// met globals.css-classes). Zelfde melding als app/_shell/app-error.tsx.
import { useEffect } from 'react';

import { StatusPage } from '@/components/site/status-page';
import { LinkButton } from '@/components/site/ui/button';
import { reportClientError } from '@/lib/observability/report-client-error';
import { ROUTES } from '@/lib/site/navigation';

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({
      surface: 'dashboard', // bestaande surface-waarden: widget|dashboard (zoals vóór de eigen root)
      message: error.message || 'render error',
      stack: error.stack,
      digest: error.digest,
      code: 'CLIENT_JS',
    });
  }, [error]);

  return (
    <StatusPage
      label="Fout"
      title="Er ging iets onverwachts mis"
      actions={
        <>
          <button type="button" className="btn btn-primary" onClick={reset}>
            Probeer opnieuw
          </button>
          <LinkButton href={ROUTES.home} variant="outline">
            Naar de startpagina
          </LinkButton>
        </>
      }
    >
      We konden deze pagina niet laden. Probeer het opnieuw{error.digest ? ` (ID: ${error.digest})` : ''}.
    </StatusPage>
  );
}
