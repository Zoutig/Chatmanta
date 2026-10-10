import Link from 'next/link';
import { euro, fromPrice, pathFor, type Accommodation } from '@/lib/voorbeeld/site-content';
import { SceneArt } from './scene-art';

export function AccommodationCard({ acc }: { acc: Accommodation }) {
  const price = fromPrice(acc);
  const href = pathFor(`accommodaties/${acc.slug}`);
  return (
    <article className="dh-card">
      <div className="dh-card-art">
        <SceneArt variant={acc.scene} className="dh-art" />
        {acc.pets.allowed && <span className="dh-badge">Hond welkom</span>}
      </div>
      <div className="dh-card-body">
        <h3 className="dh-card-title">
          <Link href={href} className="dh-card-link">
            {acc.name}
          </Link>
        </h3>
        <p className="dh-card-meta">
          {acc.kind === 'huis'
            ? `${acc.persons} personen · ${acc.bedrooms} ${acc.bedrooms === 1 ? 'slaapkamer' : 'slaapkamers'} · ${acc.sizeM2} m²`
            : `Circa ${acc.sizeM2} m² · tot ${acc.persons} personen`}
        </p>
        <p className="dh-card-text">{acc.tagline}</p>
        <p className="dh-card-price">
          <span>vanaf</span> <strong>{euro(price.amount)}</strong> <span>{price.unit}</span>
        </p>
      </div>
    </article>
  );
}
