// Next.js 404 — minimaal, in dezelfde toon als app/error.tsx. Default Next.js
// 404 is kaal Amerikaans-Engels; deze geeft een vriendelijke NL-versie en een
// weg terug.

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="app-error-page">
      <div className="app-error-card">
        <span className="app-error-label">404</span>
        <h1 className="app-error-title">Deze pagina bestaat niet</h1>
        <p className="app-error-body">
          De link is misschien verlopen of er staat een typfout in. Ga terug naar de
          startpagina om verder te zoeken.
        </p>
        <div className="app-error-actions">
          <Link href="/" className="app-error-retry">
            Terug naar start
          </Link>
        </div>
      </div>
    </div>
  );
}
