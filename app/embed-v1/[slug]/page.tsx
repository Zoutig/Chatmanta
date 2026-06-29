// Publieke V1-embed-route: rendert ALLEEN de V1-widget op een transparante body,
// geladen binnen de iframe van public/widget-v1.js. Port van app/embed/[slug]/page.tsx.
// Org+chatbot+token+appearance komen uit loadV1Embed (service-role, by slug); de
// origin-allowlist wordt daar afgedwongen (block → geen token, geen widget).
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';

import { loadV1Embed } from '@/lib/v1/widget/load-embed';
import { V1Widget } from './v1-widget';
import { EmbedBlocked } from './embed-blocked';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ h?: string }>;
};

// Transparante body zodat alleen de FAB/het paneel zichtbaar is in de iframe.
const TRANSPARENT = `html,body{background:transparent!important;margin:0;padding:0;overflow:hidden}`;

export default async function EmbedV1Page({ params, searchParams }: PageProps) {
  const { slug } = await params;

  // Het klantdomein is alleen betrouwbaar zichtbaar via de Referer van deze
  // iframe-navigatie (= de ouderpagina); de loader stuurt het ook als ?h=.
  const hdrs = await headers();
  const sp = await searchParams;
  const parentHost = hdrs.get('referer') ?? (typeof sp.h === 'string' ? sp.h : null);

  const result = await loadV1Embed(slug, parentHost);
  if (result.kind === 'notfound') notFound();
  if (result.kind === 'blocked') {
    return (
      <>
        <style>{TRANSPARENT}</style>
        <EmbedBlocked />
      </>
    );
  }

  return (
    <>
      <style>{TRANSPARENT}</style>
      <V1Widget {...result.props} />
    </>
  );
}
