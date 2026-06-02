import type { AppErrorCode } from './codes';

export type UserErrorView = {
  title: string;
  body: string;
  action?: string;
};

// Mapping code → vriendelijke Nederlandse tekst voor de eindgebruiker.
// Toon, lengte en taal zijn bewust afgestemd op een MKB-website-bezoeker:
// kort, geen jargon, altijd één concrete actie waar mogelijk.
export function userView(
  code: AppErrorCode,
  ctx?: { retryAfterSec?: number },
): UserErrorView {
  switch (code) {
    case 'RATE_LIMIT': {
      const sec = Math.max(1, Math.round(ctx?.retryAfterSec ?? 10));
      return {
        title: 'Even rustig aan',
        body: `Je stelde net veel vragen achter elkaar. Wacht ${sec} seconden en probeer het opnieuw.`,
        action: 'Probeer opnieuw',
      };
    }
    case 'BUDGET_EXHAUSTED':
      return {
        title: 'De chat is even niet beschikbaar',
        body: 'De chatassistent heeft vandaag zijn limiet bereikt en is morgen weer beschikbaar. Voor een dringende vraag kun je het beste rechtstreeks contact opnemen.',
      };
    case 'LLM_TIMEOUT':
      return {
        title: 'Het antwoord duurde te lang',
        body: 'Onze AI heeft extra tijd nodig. Probeer het over een paar seconden opnieuw — vaak gaat het de tweede keer wel goed.',
        action: 'Opnieuw proberen',
      };
    case 'LLM_UNAVAILABLE':
      return {
        title: 'De AI is even niet bereikbaar',
        body: 'We konden geen antwoord ophalen. Dit ligt buiten onze controle — probeer het zo nog eens.',
        action: 'Opnieuw proberen',
      };
    case 'EMBED_FAILED':
      return {
        title: 'We konden je vraag niet verwerken',
        body: 'Er ging iets mis bij het analyseren van je vraag. Probeer het opnieuw of formuleer je vraag iets anders.',
        action: 'Opnieuw proberen',
      };
    case 'INPUT_INVALID':
      return {
        title: 'Je vraag kan niet zo verstuurd worden',
        body: 'De vraag is leeg of te lang (max 1000 tekens). Pas je tekst aan en probeer opnieuw.',
      };
    case 'INJECTION_BLOCKED':
      return {
        title: 'Deze vraag kunnen we niet beantwoorden',
        body: 'Je bericht bevat instructies die we om veiligheidsredenen niet uitvoeren. Stel gerust een gewone vraag over onze diensten.',
      };
    case 'INGEST_TOO_LARGE':
      return {
        title: 'Bestand te groot',
        body: 'Het bestand is groter dan 200 KB. Splits het in kleinere delen of upload alleen het relevante deel.',
      };
    case 'INGEST_TYPE':
      return {
        title: 'Bestandstype niet ondersteund',
        body: 'Alleen .txt en .md worden ondersteund. Converteer je bestand of plak de tekst rechtstreeks.',
      };
    case 'INGEST_READ_FAILED':
      return {
        title: 'We konden het bestand niet lezen',
        body: 'Het bestand lijkt beschadigd of niet leesbaar als tekst. Probeer een ander bestand of plak de inhoud.',
      };
    case 'CRAWL_FAILED':
      return {
        title: 'We konden de website niet crawlen',
        body: 'Controleer of de URL klopt en publiek bereikbaar is, en probeer het opnieuw.',
        action: 'Opnieuw proberen',
      };
    case 'AUTH_REQUIRED':
      return {
        title: 'Inloggen vereist',
        body: 'Je sessie is verlopen of het wachtwoord klopt niet. Log opnieuw in om door te gaan.',
      };
    case 'AUTH_FORBIDDEN':
      return {
        title: 'Geen toegang',
        body: 'Je hebt geen rechten voor deze actie. Vraag een beheerder als dit niet klopt.',
      };
    case 'NOT_FOUND':
      return {
        title: 'Niet gevonden',
        body: 'Dit gesprek of item bestaat niet (meer). Het kan verwijderd zijn of de link is verlopen.',
      };
    case 'INTERNAL':
      return {
        title: 'Er ging iets onverwachts mis',
        body: 'We konden je verzoek niet afronden. Probeer het over een paar seconden opnieuw. Houdt het aan? Geef dan de ID hieronder door.',
        action: 'Opnieuw proberen',
      };
  }
}
