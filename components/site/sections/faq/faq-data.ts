import { PRICING } from '@/lib/site/pricing';

/**
 * FAQ-inhoud (COPY.md §12, letterlijk). Eén bron voor de accordion én de
 * FAQPage-JSON-LD, zodat die twee nooit uit elkaar lopen. De proefperiode komt uit
 * lib/site/pricing (nooit een losse limiet hardcoden).
 */
export const FAQ_ITEMS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'Verzint de chatbot weleens iets?',
    a: 'Hij is gebouwd om dat niet te doen. Hij antwoordt alleen op basis van jouw content en noemt de bron. Vindt hij geen goed antwoord, dan zegt hij dat en biedt hij contact aan. Elk gesprek kun je teruglezen.',
  },
  {
    q: 'Heb ik technische kennis nodig?',
    a: 'Nee. Wij richten alles in. Je plakt één regel code op je site, of je laat dat door ons of je webbouwer doen.',
  },
  {
    q: 'Hoe lang duurt het voor hij live staat?',
    a: 'Na de kennismaking meestal binnen een werkdag.',
  },
  {
    q: 'Wat als mijn website verandert?',
    a: 'Met één klik in je dashboard laat je ChatManta je site opnieuw lezen, en de antwoorden zijn weer actueel.',
  },
  {
    q: 'Waar staan mijn gegevens, en hoe zit het met de AVG?',
    a: 'Je gegevens worden opgeslagen in Europa. Voor het formuleren van antwoorden gebruiken we OpenAI, onder een verwerkersovereenkomst; jouw content wordt niet gebruikt om AI-modellen te trainen.',
  },
  {
    q: 'Wat als een klant een mens wil spreken?',
    a: 'Dan vraagt de chatbot om naam en contactgegevens en krijg jij direct een seintje. Jij neemt het over. (Contactverzoeken: Groei en Compleet.)',
  },
  {
    q: 'Wat gebeurt er als ik mijn limiet bereik?',
    a: 'Je krijgt eerst een seintje. Nooit onverwachte kosten.',
  },
  {
    q: 'Kan ik opzeggen?',
    a: `Ja, maandelijks opzegbaar. En de eerste ${PRICING.trialDays} dagen probeer je gratis.`,
  },
];

/** schema.org FAQPage voor rich results. */
export function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'nl-NL',
    mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
