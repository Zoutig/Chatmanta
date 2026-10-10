import type { Metadata } from 'next';

import { KennismakingForm } from '@/components/site/kennismaking/kennismaking-form';
import { Container } from '@/components/site/ui/section';
import { Icon } from '@/components/site/ui/icon';
import { parseBron, parsePakket } from '@/lib/site/kennismaking';
import '@/components/site/kennismaking/kennismaking.css';

// /kennismaking — formulier (spec §7, copy: COPY.md "/kennismaking"). Server
// component: alle tekst staat in de SSR-HTML; alleen het formulier is client.
// `?pakket=` (vanaf een prijskaart) selecteert het pakket voor, `?bron=`
// (bv. "rekenhulp") gaat mee in de notificatie aan info@.

export const metadata: Metadata = {
  title: 'Plan een kennismaking',
  description: 'In 20 minuten kijken we samen naar je site en wat ChatManta voor je kan doen. Geen verplichtingen.',
  alternates: { canonical: '/kennismaking' },
};

const TOPICS = [
  'Welke vragen je klanten nu stellen',
  'Hoe ChatManta jouw site leest en antwoordt',
  'Welk pakket past, en wanneer je live kunt',
];

const PROMISES = ['Reactie binnen 1 werkdag', 'Geen verplichtingen', 'Je gegevens blijven in Europa'];

export default async function KennismakingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const defaultPakket = parsePakket(sp.pakket);
  const bron = parseBron(sp.bron);

  return (
    <section className="s-kennis" aria-labelledby="h-kennis">
      <Container>
        <header className="kn-head">
          <h1 id="h-kennis">Plan een kennismaking</h1>
          <p className="lede">In 20 minuten kijken we samen naar je site en wat ChatManta voor je kan doen.</p>
        </header>

        <div className="kn-grid">
          <div className="kn-card">
            <KennismakingForm defaultPakket={defaultPakket} bron={bron} />
          </div>

          <aside className="kn-aside" aria-labelledby="h-kennis-topics">
            <div className="kn-contour" aria-hidden="true" />
            <h2 id="h-kennis-topics">Wat bespreken we</h2>
            <ol className="kn-topics">
              {TOPICS.map((t, i) => (
                <li key={t}>
                  <span className="kn-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
            <ul className="kn-promises">
              {PROMISES.map((p) => (
                <li key={p}>
                  <Icon name="check" size={16} />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <p className="kn-founders">Je spreekt met een van de oprichters: Sebastiaan of Niels.</p>
          </aside>
        </div>
      </Container>
    </section>
  );
}
