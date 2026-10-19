'use client';

// Stap 2 Installeren: de embed-code met kopieerknop, instructies per platform
// (keuze per platform, elk eindigt met cache legen + testen), een kant-en-klare
// tekst voor de webbouwer (kopiëren of mailto; wij versturen niets) en de
// toegestane domeinen als alleen-lezen regel met een mailto om er een aan te vragen.
// Tekst en instructies: lib/v1/widget/install-guide.ts (gedeeld met de demo-kopie).

import { useState } from 'react';
import { Copy, Mail } from 'lucide-react';
import { AttentionBlock } from '@/app/v1/_ui/feedback';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { SITE_COMPANY } from '@/lib/site/pricing';
import {
  FINISH_STEPS,
  INSTALL_PLATFORMS,
  buildDomainRequestMailto,
  buildEmbedCode,
  buildMailto,
  buildWebbouwerMessage,
} from '@/lib/v1/widget/install-guide';

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
  const code = buildEmbedCode(origin, slug);
  const [platformId, setPlatformId] = useState(INSTALL_PLATFORMS[0].id);
  const platform = INSTALL_PLATFORMS.find((p) => p.id === platformId) ?? INSTALL_PLATFORMS[0];
  const builderMessage = buildWebbouwerMessage({ code, origin, allowedDomains });

  async function copyText(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
    } catch {
      toast.error('Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.');
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
            <p className="v1-wg-lead">Plak deze regel op elke pagina van je website, vlak voor de sluitende &lt;/body&gt;-tag.</p>
            <div className="v1-wg-code">
              <code>{code}</code>
              <Button variant="secondary" size="sm" onClick={() => copyText(code, 'Code gekopieerd')}>
                <Copy size={14} /> Kopieer
              </Button>
            </div>
          </>
        ) : (
          <AttentionBlock level="critical" title="De code is nog niet beschikbaar">
            Je organisatie is nog niet helemaal ingesteld. Neem contact op met ChatManta.
          </AttentionBlock>
        )}

        <div className="v1-wg-guide">
          <p className="v1-wg-platform">Waar plak je de code?</p>
          <div className="v1-wg-chips" role="group" aria-label="Kies je platform">
            {INSTALL_PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="v1-wg-chip"
                aria-pressed={p.id === platform.id}
                onClick={() => setPlatformId(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="v1-wg-guide-body">
            <ol>
              {[...platform.steps, ...FINISH_STEPS].map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {platform.note ? <p className="v1-wg-note">{platform.note}</p> : null}
          </div>
        </div>

        {slug ? (
          <details className="v1-details">
            <summary>Stuur naar je webbouwer</summary>
            <div className="v1-details-body">
              <p className="v1-wg-note">
                Plaatst iemand anders je website? Stuur deze tekst door. Er staat alles in wat hij of zij nodig heeft.
              </p>
              <textarea
                className="v1-wg-message"
                readOnly
                value={builderMessage}
                rows={10}
                aria-label="Tekst voor je webbouwer"
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="v1-wg-message-actions">
                <Button variant="secondary" size="sm" onClick={() => copyText(builderMessage, 'Tekst gekopieerd')}>
                  <Copy size={14} /> Kopieer tekst
                </Button>
                <a
                  className="v1-link v1-wg-mailto"
                  href={buildMailto({ subject: 'Chatbot op onze website zetten', body: builderMessage })}
                >
                  <Mail size={14} aria-hidden="true" /> Open in je mailprogramma
                </a>
              </div>
            </div>
          </details>
        ) : null}

        <dl className="v1-rows v1-wg-rows">
          <div className="v1-row">
            <dt className="v1-row-label">Toegestane domeinen</dt>
            <dd className="v1-row-value">
              {allowedDomains.length === 0 ? 'Geen beperking, werkt op elke website' : allowedDomains.join(', ')}
              <span className="v1-row-sub">
                Beheerd door ChatManta. Ander domein of testomgeving?{' '}
                <a
                  className="v1-link"
                  href={buildDomainRequestMailto({ supportEmail: SITE_COMPANY.email, slug, allowedDomains })}
                >
                  Laat het ons weten
                </a>
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
