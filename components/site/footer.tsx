import Link from 'next/link';
import { SITE_COMPANY } from '@/lib/site/pricing';
import { ROUTES, anchor } from '@/lib/site/navigation';
import { Logo } from './ui/logo';

/** Site-footer (mockup-final §14). KvK pas tonen zodra SITE_COMPANY.kvk gevuld is. */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot">
          <div className="brand">
            <Logo ariaLabel="ChatManta, naar de startpagina" />
            <p>De Nederlandse website-chatbot die alleen antwoordt uit jouw eigen website en documenten.</p>
          </div>
          <nav aria-labelledby="foot-product">
            <h2 id="foot-product">Product</h2>
            <ul>
              <li><a href={anchor('how')}>Hoe het werkt</a></li>
              <li><a href={anchor('features')}>Functies</a></li>
              <li><a href={anchor('pricing')}>Prijzen</a></li>
              <li><Link href={ROUTES.demo}>Live demo</Link></li>
            </ul>
          </nav>
          <nav aria-labelledby="foot-bedrijf">
            <h2 id="foot-bedrijf">Bedrijf</h2>
            <ul>
              <li><Link href={ROUTES.kennismaking}>Kennismaking</Link></li>
              <li><a href={`mailto:${SITE_COMPANY.email}`}>{SITE_COMPANY.email}</a></li>
            </ul>
          </nav>
          <nav aria-labelledby="foot-juridisch">
            <h2 id="foot-juridisch">Juridisch</h2>
            <ul>
              <li><Link href={ROUTES.privacy}>Privacy</Link></li>
              <li><Link href={ROUTES.voorwaarden}>Voorwaarden</Link></li>
            </ul>
          </nav>
        </div>
        <div className="foot-bottom">
          <span>Een Nederlands bedrijf</span>
          {SITE_COMPANY.kvk ? <span>KvK {SITE_COMPANY.kvk}</span> : null}
          <span>© {year} {SITE_COMPANY.name}</span>
        </div>
      </div>
    </footer>
  );
}
