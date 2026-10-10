import type { Metadata } from 'next';
import Link from 'next/link';
import { ACCOMMODATIONS, getPageBySlug, pathFor, type SiteSection } from '@/lib/voorbeeld/site-content';
import { AccommodationCard } from './_components/accommodation-card';
import { SceneArt } from './_components/scene-art';
import { SectionBlock } from './_components/page-body';

const home = getPageBySlug('')!;

export const metadata: Metadata = {
  title: { absolute: 'Vakantiepark De Duinhoeve | Vakantie tussen duin en zee' },
  description: home.description,
};

const HIGHLIGHT_ICONS = ['wave', 'pool', 'cup', 'star', 'leaf', 'home'] as const;

function HighlightIcon({ name }: { name: (typeof HIGHLIGHT_ICONS)[number] }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {name === 'wave' && <path {...common} d="M2 15c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 19c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M12 4l3 6H9z" />}
      {name === 'pool' && <path {...common} d="M3 18c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M7 15V5a2 2 0 0 1 4 0M13 15V5a2 2 0 0 1 4 0M7 9h6" />}
      {name === 'cup' && <path {...common} d="M4 8h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2" />}
      {name === 'star' && <path {...common} d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />}
      {name === 'leaf' && <path {...common} d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7" />}
      {name === 'home' && <path {...common} d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6" />}
    </svg>
  );
}

function sectionByIndex(i: number): SiteSection | undefined {
  return home.sections[i];
}

export default function VoorbeeldWebsiteHome() {
  const highlights = sectionByIndex(0);
  const stay = sectionByIndex(1);
  const reviews = sectionByIndex(2);
  const rest = home.sections.slice(3);

  return (
    <>
      <section className="dh-hero" aria-labelledby="dh-hero-title">
        <SceneArt variant="duinen" className="dh-hero-art" />
        <div className="dh-hero-shade" aria-hidden="true" />
        <div className="dh-container dh-hero-inner">
          <p className="dh-eyebrow">Westerduin, Zeeland · sinds 1987</p>
          <h1 id="dh-hero-title" className="dh-hero-title">
            {home.title}
          </h1>
          <p className="dh-hero-intro">{home.intro}</p>
          <div className="dh-hero-actions">
            <Link href={pathFor('accommodaties')} className="dh-btn dh-btn-primary">
              Bekijk accommodaties
            </Link>
            <Link href={pathFor('prijzen')} className="dh-btn dh-btn-ghost">
              Prijzen 2027
            </Link>
          </div>
        </div>
      </section>

      <div className="dh-facts-strip">
        <div className="dh-container">
          <ul className="dh-facts" aria-label="Het park in het kort">
            <li>
              <strong>400 m</strong>
              <span>tot het strand</span>
            </li>
            <li>
              <strong>28 °C</strong>
              <span>overdekt zwembad</span>
            </li>
            <li>
              <strong>8,9</strong>
              <span>gemiddeld gastencijfer</span>
            </li>
            <li>
              <strong>1987</strong>
              <span>familiebedrijf sinds</span>
            </li>
          </ul>
        </div>
      </div>

      {highlights && (
        <section className="dh-band" aria-labelledby="dh-highlights">
          <div className="dh-container">
            <h2 id="dh-highlights" className="dh-h2 dh-center">
              {highlights.heading}
            </h2>
            <ul className="dh-highlights">
              {(highlights.bullets ?? []).map((b, i) => (
                <li key={i} className="dh-highlight">
                  <span className="dh-highlight-icon">
                    <HighlightIcon name={HIGHLIGHT_ICONS[i % HIGHLIGHT_ICONS.length]} />
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="dh-band dh-band-sand" aria-labelledby="dh-stay">
        <div className="dh-container">
          <div className="dh-band-head">
            <div>
              <p className="dh-eyebrow dh-eyebrow-dark">Accommodaties</p>
              <h2 id="dh-stay" className="dh-h2">
                {stay?.heading ?? 'Overnachten op De Duinhoeve'}
              </h2>
            </div>
            <Link href={pathFor('accommodaties')} className="dh-text-link">
              Alle accommodaties →
            </Link>
          </div>
          {stay?.paragraphs?.map((p, i) => (
            <p key={i} className="dh-p dh-lead">
              {p}
            </p>
          ))}
          <div className="dh-cards">
            {ACCOMMODATIONS.map((acc) => (
              <AccommodationCard key={acc.slug} acc={acc} />
            ))}
          </div>
        </div>
      </section>

      {reviews && (
        <section className="dh-band" aria-labelledby="dh-reviews">
          <div className="dh-container">
            <h2 id="dh-reviews" className="dh-h2 dh-center">
              {reviews.heading}
            </h2>
            {reviews.paragraphs?.map((p, i) => (
              <p key={i} className="dh-p dh-center dh-muted">
                {p}
              </p>
            ))}
            <div className="dh-quotes">
              {(reviews.quotes ?? []).map((q, i) => (
                <figure key={i} className="dh-quote">
                  <span className="dh-stars" aria-hidden="true">
                    ★★★★★
                  </span>
                  <blockquote>
                    <p>{q.text}</p>
                  </blockquote>
                  <figcaption>{q.author}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <div className="dh-band dh-band-sand">
          <div className="dh-container dh-prose-narrow">
            {rest.map((s) => (
              <SectionBlock key={s.heading} section={s} />
            ))}
          </div>
        </div>
      )}

      <section className="dh-cta" aria-labelledby="dh-cta-title">
        <SceneArt variant="strand" className="dh-cta-art" />
        <div className="dh-cta-shade" aria-hidden="true" />
        <div className="dh-container dh-cta-inner">
          <h2 id="dh-cta-title" className="dh-cta-title">
            Zin in zeelucht?
          </h2>
          <p>Bekijk de beschikbaarheid of stel je vraag aan onze chatbot rechtsonder.</p>
          <div className="dh-hero-actions">
            <Link href={pathFor('boeken-en-betalen')} className="dh-btn dh-btn-sun">
              Zo boek je
            </Link>
            <Link href={pathFor('veelgestelde-vragen')} className="dh-btn dh-btn-ghost">
              Veelgestelde vragen
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
