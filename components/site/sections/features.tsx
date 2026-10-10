import { SECTION_IDS } from '@/lib/site/navigation';
import { Icon } from '../ui/icon';
import { Mark } from '../ui/logo';
import { Reveal } from '../ui/reveal';
import { Section, SectionHead } from '../ui/section';
import { BentoPlay } from './features/bento-play';
import './features.css';

/** Gesprekken-demo: vier rijen, twee keer (naadloze loop van de omhoog-scroll). */
const READ_ROWS = [
  { t: '23:04', q: 'Zijn jullie zaterdag open?', ok: true },
  { t: '22:41', q: 'Wat kost een nieuwe ketting?', ok: true },
  { t: '21:15', q: 'Doen jullie ook e-bikes?', ok: false },
  { t: '19:02', q: 'Kan ik een fiets huren?', ok: true },
];

/**
 * §6 Functies — bento met micro-demo's (CSS-loops). Max 2 tegels spelen tegelijk
 * (BentoPlay); reduced motion toont de eindstand. Demo's zijn decoratief (aria-hidden).
 */
export default function Features() {
  return (
    <Section id={SECTION_IDS.features} variant="default" className="s-features" labelledBy="h-feat">
      <Reveal>
        <SectionHead eyebrow="Functies" titleId="h-feat" title="Alles wat je nodig hebt. Niets wat je niet gebruikt." />
      </Reveal>
      <BentoPlay>
        <article className="tile-b t-lead" data-tile="lead" tabIndex={0} aria-labelledby="f-lead">
          <div className="demo d-lead" aria-hidden="true">
            <div className="form">
              <i />
              <i />
              <i />
              <b />
            </div>
            <div className="box">
              <svg viewBox="0 0 24 24">
                <path
                  d="M3 13l3-8h12l3 8v6H3z M3 13h5l1 2h6l1-2h5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="badge">1</span>
          </div>
          <h3 id="f-lead">Leads binnenhalen</h3>
          <span className="tag">In Groei en Compleet</span>
          <p>
            Weet de bot het niet, of wil iemand een offerte? Dan vraagt hij netjes om naam en contactgegevens, en jij
            krijgt een seintje.
          </p>
        </article>

        <article className="tile-b t-read" data-tile="read" tabIndex={0} aria-labelledby="f-read">
          <div className="demo d-read" aria-hidden="true">
            <div className="rows">
              {[...READ_ROWS, ...READ_ROWS].map((r, i) => (
                <div className="r" key={i}>
                  <time>{r.t}</time>
                  {r.q}
                  <em className={r.ok ? undefined : 'no'}>{r.ok ? 'Beantwoord' : 'Doorgestuurd'}</em>
                </div>
              ))}
            </div>
          </div>
          <h3 id="f-read">Gesprekken teruglezen</h3>
          <p>Zie precies wat bezoekers vragen en wat de bot antwoordde. Gratis marktonderzoek.</p>
        </article>

        <article className="tile-b t-quiz" data-tile="quiz" tabIndex={0} aria-labelledby="f-quiz">
          <div className="demo d-quiz" aria-hidden="true">
            <div className="q">
              <span className="a">?</span>
              <span className="b">✓</span>
            </div>
            <small>&ldquo;Doen jullie ook e-bikes?&rdquo;</small>
          </div>
          <h3 id="f-quiz">Kennisgat-quiz</h3>
          <p>
            ChatManta ziet welke vragen hij niet kon beantwoorden en stelt jou een paar korte vragen. Jouw antwoord vult
            het gat, voortaan voor iedereen.
          </p>
        </article>

        <article className="tile-b t-style" data-tile="style" tabIndex={0} aria-labelledby="f-style">
          <div className="demo d-style" aria-hidden="true">
            <div className="site">
              <i />
              <i />
              <i />
            </div>
            <div className="sw">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="wb">
              <Mark />
            </div>
          </div>
          <h3 id="f-style">Jouw stijl, jouw logo</h3>
          <p>Eigen kleur, eigen icoon, eigen begroeting. Het voelt als onderdeel van je site.</p>
        </article>

        <article className="tile-b t-fast" data-tile="fast" tabIndex={0} aria-labelledby="f-fast">
          <div className="demo d-fast" aria-hidden="true">
            <svg className="g" viewBox="0 0 150 90">
              <path d="M15 78a60 60 0 0 1 120 0" fill="none" stroke="#d3dce5" strokeWidth="8" strokeLinecap="round" />
              <path d="M105 30a60 60 0 0 1 30 48" fill="none" stroke="#0d9488" strokeWidth="8" strokeLinecap="round" />
              <g className="needle">
                <path d="M75 78V30" stroke="#0c1e2e" strokeWidth="3" strokeLinecap="round" />
              </g>
              <circle cx="75" cy="78" r="6" fill="#0c1e2e" />
            </svg>
          </div>
          <h3 id="f-fast">Fast mode</h3>
          <span className="tag">In Groei en Compleet</span>
          <p>
            Wij gebruiken de priority-verwerking van OpenAI. Zo krijgen de vragen van jouw bezoekers voorrang en komt het
            antwoord sneller, ook op drukke momenten.
          </p>
        </article>

        <article className="tile-b t-src" data-tile="src" tabIndex={0} aria-labelledby="f-src">
          <div className="inner">
            <div>
              <h3 id="f-src">Antwoord mét bron</h3>
              <p>Elk antwoord linkt naar de pagina waar het vandaan komt, zodat je klant het zelf kan nalezen.</p>
            </div>
            <div className="demo d-src" aria-hidden="true">
              <div className="bubble">Een nieuwe ketting kost €24,95, inclusief montage.</div>
              <span className="chip">
                <Icon name="link" />
                Bron: <span className="u">vandam-fietsen.nl/prijzen</span>
              </span>
            </div>
          </div>
        </article>
      </BentoPlay>
    </Section>
  );
}
