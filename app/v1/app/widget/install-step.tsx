'use client';

// Stap 2 Installeren: de embed-code met kopieerknop, instructies per platform
// (ingeklapt) en de toegestane domeinen als alleen-lezen regel.

import { Copy } from 'lucide-react';
import { AttentionBlock } from '@/app/v1/_ui/feedback';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';

const PLATFORMS: { name: string; steps: string[] }[] = [
  {
    name: 'WordPress',
    steps: [
      'Ga naar Weergave en dan Thema-editor, of installeer een plugin zoals "Header & Footer Scripts".',
      'Plak de code in het veld voor footer-scripts.',
      'Sla op en bekijk je website. De chatknop staat rechts- of linksonder.',
    ],
  },
  {
    name: 'Webflow',
    steps: [
      'Open je project en ga naar Site Settings en dan Custom Code.',
      'Plak de code in het veld Footer Code.',
      'Publiceer je site. De chatbot is direct actief.',
    ],
  },
  {
    name: 'Shopify',
    steps: [
      'Ga naar Online Store, Themes en dan Edit Code.',
      'Open theme.liquid en plak de code vlak voor </body>.',
      'Sla op en open je winkel.',
    ],
  },
  {
    name: 'Eigen website',
    steps: [
      'Plak de code in je HTML, vlak voor de sluitende </body>-tag.',
      'Zet de aangepaste pagina online.',
      'Ververs je website. De chatknop verschijnt.',
    ],
  },
];

export function InstallStep({
  slug,
  origin,
  allowedDomains,
}: {
  slug: string;
  origin: string;
  allowedDomains: string[];
}) {
  const toast = useToast();
  const code = `<script src="${origin}/widget-v1.js" data-org="${slug}" defer></script>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Code gekopieerd');
    } catch {
      toast.error('Kopiëren lukte niet. Selecteer de code en kopieer hem zelf.');
    }
  }

  return (
    <section className="v1-wg-step" aria-labelledby="wg-step-2">
      <h2 id="wg-step-2" className="v1-wg-step-title">
        <span className="v1-wg-step-num">2</span> Installeren
      </h2>
      <div className="v1-card v1-wg-install">
        {slug ? (
          <>
            <p className="v1-wg-lead">Plak deze regel op je website, vlak voor de sluitende &lt;/body&gt;-tag.</p>
            <div className="v1-wg-code">
              <code>{code}</code>
              <Button variant="secondary" size="sm" onClick={copy}>
                <Copy size={14} /> Kopieer
              </Button>
            </div>
          </>
        ) : (
          <AttentionBlock level="critical" title="De code is nog niet beschikbaar">
            Je organisatie is nog niet helemaal ingesteld. Neem contact op met ChatManta.
          </AttentionBlock>
        )}

        <details className="v1-details">
          <summary>Stappen per platform</summary>
          <div className="v1-details-body v1-wg-platforms">
            {PLATFORMS.map((p) => (
              <div key={p.name}>
                <p className="v1-wg-platform">{p.name}</p>
                <ol>
                  {p.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </details>

        <dl className="v1-rows v1-wg-rows">
          <div className="v1-row">
            <dt className="v1-row-label">Toegestane domeinen</dt>
            <dd className="v1-row-value">
              {allowedDomains.length === 0 ? 'Geen beperking, werkt op elke website' : allowedDomains.join(', ')}
              <span className="v1-row-sub">Beheerd door ChatManta.</span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
