// /widget/[slug]/[page] — rendert één pagina van de fake-website.
//
// De pagina-body komt uit een markdown-bestand in
// `scripts/fixtures/sandbox-orgs/<slug>/`. Diezelfde markdowns voeden ook
// de chatbot — zo zien bezoeker en bot dezelfde feiten en kan elke
// suggested-question kruis-geverifieerd worden op een zichtbare pagina.

import type { Metadata } from 'next';

import { loadOrgPage } from '@/lib/widget/load-org-page';
import { renderMarkdown, type MarkdownTheme } from '@/lib/widget/render-markdown';
import { findPage, getSkin, ORG_SLUGS_WIDGET } from '../../org-skins';

type PageProps = {
  params: Promise<{ slug: string; page: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, page } = await params;
  const entry = findPage(slug, page);
  if (!entry) return {};
  const skin = getSkin(slug);
  return {
    title: `${entry.navLabel} · ${skin.companyName}`,
  };
}

// Pre-generate alle bekende (slug, page)-combinaties zodat het static-prerender
// werkt waar mogelijk en de dynamic-route niet altijd hoeft te draaien.
export async function generateStaticParams() {
  const out: Array<{ slug: string; page: string }> = [];
  for (const slug of ORG_SLUGS_WIDGET) {
    for (const p of getSkin(slug).pages) {
      out.push({ slug, page: p.slug });
    }
  }
  return out;
}

export default async function OrgSubpage({ params }: PageProps) {
  const { slug, page } = await params;
  const { markdown } = await loadOrgPage(slug, page);
  const skin = getSkin(slug);

  const isDark = isHexDark(skin.bgColor);
  const theme: MarkdownTheme = {
    primaryColor: skin.primaryColor,
    textColor: skin.textColor,
    mutedText: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)',
    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
    cardColor: skin.cardColor,
  };

  return (
    <article
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '64px 48px 96px',
        color: skin.textColor,
      }}
    >
      {renderMarkdown(markdown, theme)}
    </article>
  );
}

// Gedupliceerd uit fake-site.tsx — een server-component kan geen client
// helper importeren. De heuristiek is zo klein dat één extra kopie geen
// onderhoudslast vormt.
function isHexDark(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
}
