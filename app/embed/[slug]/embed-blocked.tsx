'use client';

import { useEffect } from 'react';

// Gerenderd i.p.v. de widget wanneer de ouderpagina niet op de org-allowlist
// staat. Toont bewust niets (geen FAB), maar logt een duidelijke uitleg in de
// console zodat de site-eigenaar ziet waarom de widget niet verschijnt.
export function EmbedBlocked() {
  useEffect(() => {
    console.warn(
      '[ChatManta] De chat-widget is niet geactiveerd voor dit domein. ' +
        'Voeg dit domein toe onder "Toegestane domeinen" in de ChatManta ' +
        'widget-instellingen, of laat het veld leeg om alle domeinen toe te staan.',
    );
  }, []);
  return null;
}
