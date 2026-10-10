import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site/navigation';

// Crawlers welkom op de marketingsite; niet op V0, het V1-klantdashboard of de API.
// (Die zijn sowieso afgeschermd — dit voorkomt alleen zinloze crawl-pogingen.)
// Publiek bereikbaar via de proxy-uitzondering `robots\.txt$` (proxy.ts).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/v0', '/v1/app', '/api'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
