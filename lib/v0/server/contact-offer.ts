// Contact-offer stream-event — gedeeld contract tussen de chat-pijplijn
// (app/api/v0/chat/route.ts, die het event yieldt) en de widget
// (app/widget/components/chatmanta-widget.tsx, die het vangt en het
// formulier-kaartje toont).
//
// BEWUST losse wire-vorm, NIET toegevoegd aan de StreamEvent-union in
// lib/v0/server/rag.ts: het event wordt ná de generator-drain in route.ts
// geyield, niet vanuit rag.ts — zo blijft rag.ts (en daarmee de eval-baseline
// en het antwoordpad) byte-identiek. Zie de big-ship PLAN (SEAM 2).

/** Hoeveel dagen een contactverzoek bewaard blijft vóór harde verwijdering.
 *  Eén bron-van-waarheid voor de consent-zin en de retentie-cron (migr 0053). */
export const CONTACT_RETENTION_DAYS = 90;

/** Door de bot uit het gesprek voorgevulde formuliervelden. In M1 leeg; M7
 *  (detectContactIntent) vult ze. Altijd gesanitiseerd vóór ze hier landen. */
export type ContactOfferPrefill = {
  name?: string;
  subject?: string;
  toelichting?: string;
};

/** NDJSON-event dat de widget vertelt het contactaanbod te tonen. */
export type ContactOfferEvent = {
  kind: 'contact-offer';
  prefill: ContactOfferPrefill;
  consentText: string;
};

/** AVG-toestemmingszin met bedrijfsnaam + retentienoot. Eén plek zodat de
 *  consent-tekst in de widget exact matcht met wat we beloven te bewaren. */
export function buildContactConsentText(companyName: string): string {
  const naam = companyName.trim() || 'dit bedrijf';
  return `Ik ga ermee akkoord dat ${naam} mijn gegevens gebruikt om contact met me op te nemen. Mijn gegevens worden na ${CONTACT_RETENTION_DAYS} dagen verwijderd.`;
}

/** Bouw het contact-offer event. `prefill` default leeg (M1-skelet); M7 geeft
 *  de gesaniseerde prefill mee. */
export function buildContactOfferEvent(
  companyName: string,
  prefill: ContactOfferPrefill = {},
): ContactOfferEvent {
  return {
    kind: 'contact-offer',
    prefill,
    consentText: buildContactConsentText(companyName),
  };
}
