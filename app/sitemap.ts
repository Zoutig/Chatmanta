import type { MetadataRoute } from 'next';
import { ROUTES, SITE_URL } from '@/lib/site/navigation';

// Alleen de publieke marketing-pagina's. V0/V1/API/embed horen hier nooit in.
// Publiek bereikbaar via de proxy-uitzondering `sitemap\.xml$` (proxy.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Array<{ path: string; priority: number }> = [
    { path: ROUTES.home, priority: 1 },
    { path: ROUTES.kennismaking, priority: 0.8 },
    { path: ROUTES.privacy, priority: 0.3 },
    { path: ROUTES.voorwaarden, priority: 0.3 },
  ];
  return pages.map(({ path, priority }) => ({
    url: path === '/' ? SITE_URL : `${SITE_URL}${path}`,
    changeFrequency: 'monthly',
    priority,
  }));
}
