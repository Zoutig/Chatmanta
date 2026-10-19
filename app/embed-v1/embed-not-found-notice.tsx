'use client';

import { useEffect } from 'react';

// Rendert niets; legt de site-eigenaar in de console uit waarom de widget niet
// verschijnt. Bewust zonder slug, org- of klantinfo.
export function EmbedNotFoundNotice() {
  useEffect(() => {
    console.warn(
      '[ChatManta] De chat-widget is niet gevonden. Controleer het data-org-attribuut ' +
        'in de embed-code, of neem contact op met ChatManta.',
    );
  }, []);
  return null;
}
