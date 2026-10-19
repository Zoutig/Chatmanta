// Marketingsite — schema.org-gegevens (JSON-LD) voor de homepage: wie we zijn en wat
// we verkopen. Bedragen komen uit lib/site/pricing.ts, nooit hardcoden.
// Puur en framework-vrij.

import { SITE_URL } from './navigation';
import { PRICING, SITE_COMPANY, TIERS, monthlyPrice } from './pricing';

const DESCRIPTION =
  'Nederlandse website-chatbot die alleen antwoordt uit je eigen website en documenten, en eerlijk zegt wanneer hij iets niet weet.';

export function homeJsonLd() {
  const prices = TIERS.map((t) => monthlyPrice(t, 'yearly'));
  const orgId = `${SITE_URL}/#organisatie`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': orgId,
        name: SITE_COMPANY.name,
        url: SITE_URL,
        logo: `${SITE_URL}/icon.png`,
        email: SITE_COMPANY.email,
      },
      {
        '@type': 'WebSite',
        name: SITE_COMPANY.name,
        url: SITE_URL,
        inLanguage: 'nl-NL',
        publisher: { '@id': orgId },
      },
      {
        '@type': 'SoftwareApplication',
        name: SITE_COMPANY.name,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: DESCRIPTION,
        inLanguage: 'nl-NL',
        provider: { '@id': orgId },
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: PRICING.currency,
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: TIERS.length,
        },
      },
    ],
  };
}
