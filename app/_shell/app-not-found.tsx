// Next.js 404 — minimaal, in dezelfde toon als app/error.tsx. Default Next.js
// 404 is kaal Amerikaans-Engels; deze geeft een vriendelijke NL-versie en een
// weg terug.
//
// Gedeeld door meerdere secties; elke sectie geeft zijn eigen startpagina mee via
// `homeHref` (V1 → /v1/app, demo → /voorbeeld, V0 → /v0/home, privacy → /).
// De embed-iframe van V1 gebruikt deze pagina bewust NIET (app/embed-v1/not-found.tsx).

import Link from 'next/link';

export default function NotFound({ homeHref = '/' }: { homeHref?: string }) {
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
          <Link href={homeHref} className="app-error-retry">
            Terug naar start
          </Link>
        </div>
      </div>
    </div>
  );
}
