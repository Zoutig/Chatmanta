// /widget/[slug]/[page] — rendert één pagina van de fake-website.
//
// De pagina-body komt uit een markdown-bestand in
// `scripts/fixtures/sandbox-orgs/<slug>/`. Diezelfde markdowns voeden ook
// de chatbot — zo zien bezoeker en bot dezelfde feiten en kan elke
// suggested-question kruis-geverifieerd worden op een zichtbare pagina.
//
// Per pagina kiest `renderPageByKind` op basis van `findPage().kind` een
// passende template (hero / services / pricing / faq / contact / standard).

import type { Metadata } from 'next';

import { loadOrgPage } from '@/lib/widget/load-org-page';
import { renderPageByKind } from '@/lib/widget/page-templates';
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
  const entry = findPage(slug, page);
  const { markdown } = await loadOrgPage(slug, page);
  const skin = getSkin(slug);

  // entry kan niet null zijn als loadOrgPage al door findPage is heen — die
  // throw't notFound() bij miss. Maar typeguard voor TS:
  if (!entry) return null;

  return renderPageByKind({
    kind: entry.kind,
    skin,
    markdown,
    navLabel: entry.navLabel,
  });
}
