// /widget — root redirect naar de juiste org+page.
//
// Sinds de demo multi-page is verspreid hij over /widget/[slug]/[page].
// Deze root-route bepaalt welke org de bezoeker als laatste gebruikte
// (via v0_active_org cookie) en stuurt hem door naar haar eerste pagina.
// Cookie-slug die niet meer in de widget-rotatie zit (bv. dev-org dat
// geen markdown-bronnen heeft) valt terug op de eerste ORG_SLUGS_WIDGET.
//
// /widget valt onder de V0 page-gate in proxy.ts — bezoeker moet eerst
// V0_DEMO_PASSWORD invoeren.

import { redirect } from 'next/navigation';

import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getSkin, ORG_SLUGS_WIDGET } from './org-skins';

export const dynamic = 'force-dynamic';

export default async function WidgetRootRedirect() {
  const active = await getActiveOrgFromCookies();

  const targetSlug = ORG_SLUGS_WIDGET.includes(active.slug)
    ? active.slug
    : ORG_SLUGS_WIDGET[0];

  const firstPage = getSkin(targetSlug).pages[0];
  redirect(`/widget/${targetSlug}/${firstPage.slug}`);
}
