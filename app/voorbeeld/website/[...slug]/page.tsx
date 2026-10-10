import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ACCOMMODATIONS,
  COMPANY,
  SITE_PAGES,
  euro,
  fromPrice,
  getAccommodation,
  getPageBySlug,
  pathFor,
  type SitePage,
} from '@/lib/voorbeeld/site-content';
import { AccommodationCard } from '../_components/accommodation-card';
import { SectionBlock, sectionId } from '../_components/page-body';
import { SceneArt } from '../_components/scene-art';

type Params = { slug: string[] };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return SITE_PAGES.filter((p) => p.slug !== '').map((p) => ({ slug: p.slug.split('/') }));
}

function resolve(slug: string[]): SitePage | undefined {
  const joined = slug.join('/');
  return joined ? getPageBySlug(joined) : undefined;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const page = resolve(slug);
  if (!page) return { title: 'Pagina niet gevonden' };
  return { title: page.title, description: page.description };
}

export default async function VoorbeeldWebsitePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const page = resolve(slug);
  if (!page) notFound();

  const acc = page.accommodationSlug ? getAccommodation(page.accommodationSlug) : undefined;
  const isOverview = page.slug === 'accommodaties';
  const showToc = page.sections.length >= 4;

  return (
    <>
      <section className="dh-page-hero" aria-labelledby="dh-page-title">
        <SceneArt variant={page.scene} className="dh-page-hero-art" />
        <div className="dh-page-hero-shade" aria-hidden="true" />
        <div className="dh-container dh-page-hero-inner">
          <nav aria-label="Kruimelpad" className="dh-crumbs">
            <ol>
              <li>
                <Link href={pathFor('')}>Home</Link>
              </li>
              {acc && (
                <li>
                  <Link href={pathFor('accommodaties')}>Accommodaties</Link>
                </li>
              )}
              <li aria-current="page">{page.navLabel}</li>
            </ol>
          </nav>
          <h1 id="dh-page-title" className="dh-page-title">
            {page.title}
          </h1>
          <p className="dh-page-intro">{page.intro}</p>
        </div>
      </section>

      {isOverview && (
        <div className="dh-band dh-band-sand dh-band-tight">
          <div className="dh-container">
            <div className="dh-cards">
              {ACCOMMODATIONS.map((a) => (
                <AccommodationCard key={a.slug} acc={a} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="dh-container dh-page-grid">
        <article className="dh-article">
          {page.sections.map((s) => (
            <SectionBlock key={s.heading} section={s} />
          ))}
        </article>

        <aside className="dh-aside" aria-label="Snel naar">
          {acc ? (
            <div className="dh-aside-card dh-aside-acc">
              <p className="dh-aside-kicker">{acc.name}</p>
              <p className="dh-aside-price">
                vanaf <strong>{euro(fromPrice(acc).amount)}</strong>
                <span>{fromPrice(acc).unit}</span>
              </p>
              <ul className="dh-aside-facts">
                <li>Max. {acc.persons} personen</li>
                {acc.kind === 'huis' && <li>{acc.bedrooms} {acc.bedrooms === 1 ? 'slaapkamer' : 'slaapkamers'}</li>}
                <li>Circa {acc.sizeM2} m²</li>
                <li>{acc.pets.allowed ? `Huisdieren: max. ${acc.pets.max}` : 'Geen huisdieren'}</li>
              </ul>
              <Link href={pathFor('boeken-en-betalen')} className="dh-btn dh-btn-primary dh-btn-block">
                Zo boek je
              </Link>
              <Link href={pathFor('prijzen')} className="dh-text-link">
                Alle prijzen en seizoenen →
              </Link>
            </div>
          ) : (
            showToc && (
              <nav className="dh-aside-card" aria-label="Op deze pagina">
                <p className="dh-aside-kicker">Op deze pagina</p>
                <ul className="dh-toc">
                  {page.sections.map((s) => (
                    <li key={s.heading}>
                      <a href={`#${sectionId(s.heading)}`}>{s.heading}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            )
          )}

          <div className="dh-aside-card dh-aside-help">
            <p className="dh-aside-kicker">Vraag het ons</p>
            <p>Stel je vraag aan de chatbot rechtsonder, of neem contact op met de receptie.</p>
            <p>
              <a href={`tel:${COMPANY.phone.replace(/\s/g, '')}`}>{COMPANY.phone}</a>
              <br />
              <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
            </p>
          </div>
        </aside>
      </div>

      {acc && (
        <div className="dh-band dh-band-sand dh-band-tight">
          <div className="dh-container">
            <h2 className="dh-h2">Andere accommodaties</h2>
            <div className="dh-cards dh-cards-3">
              {ACCOMMODATIONS.filter((a) => a.slug !== acc.slug)
                .slice(0, 3)
                .map((a) => (
                  <AccommodationCard key={a.slug} acc={a} />
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
