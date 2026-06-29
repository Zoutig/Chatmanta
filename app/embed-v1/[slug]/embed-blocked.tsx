'use client';

import { useEffect } from 'react';

// Gerenderd i.p.v. de widget wanneer de ouderpagina niet op de org-allowlist staat.
// Toont bewust niets (geen FAB), maar logt een duidelijke uitleg in de console zodat
// de site-eigenaar ziet waarom de widget niet verschijnt. Port van V0 EmbedBlocked.
export function EmbedBlocked() {
  useEffect(() => {
    console.warn(
      '[ChatManta] De chat-widget is niet geactiveerd voor dit domein. ' +
        'Neem contact op met ChatManta om dit domein toe te voegen aan de toegestane domeinen.',
    );
  }, []);
  return null;
}
