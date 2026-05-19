// Dispatcher: kies de juiste page-template op basis van `kind`.
//
// Wordt aangeroepen vanuit `app/widget/[slug]/[page]/page.tsx`. Geeft een
// React-component (server component) terug die op de gegeven markdown + skin
// is afgestemd.

import type { OrgSkin } from '@/app/widget/org-skins';
import type { PageKind } from '@/app/widget/org-skins';
import { HeroPageTemplate } from './hero';
import { ServicesPageTemplate } from './services';
import { PricingPageTemplate } from './pricing';
import { FaqPageTemplate } from './faq';
import { ContactPageTemplate } from './contact';
import { StandardPageTemplate } from './standard';

export function renderPageByKind({
  kind,
  skin,
  markdown,
  navLabel,
}: {
  kind: PageKind;
  skin: OrgSkin;
  markdown: string;
  navLabel: string;
}) {
  switch (kind) {
    case 'hero':
      return <HeroPageTemplate skin={skin} markdown={markdown} />;
    case 'services':
      return <ServicesPageTemplate skin={skin} markdown={markdown} />;
    case 'pricing':
      return <PricingPageTemplate skin={skin} markdown={markdown} />;
    case 'faq':
      return <FaqPageTemplate skin={skin} markdown={markdown} />;
    case 'contact':
      return <ContactPageTemplate skin={skin} markdown={markdown} />;
    case 'standard':
    default:
      return <StandardPageTemplate skin={skin} markdown={markdown} eyebrow={navLabel} />;
  }
}
