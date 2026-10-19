// V1 admin — 'Wat is er aan de hand' bovenaan de klant-detail. Server component:
// signalen uit lib/v1/admin/klant-attention.ts, per regel een directe link naar de
// plek waar je het oplost, plus de snelle actie 'Antwoord-cache legen'.

import Link from 'next/link';
import { Badge, type Tone } from '@/app/v1/_ui/feedback';
import { buttonClass } from '@/app/v1/_ui/button';
import type { AdminAttentionItem } from '@/lib/v1/admin/klant-attention';
import { PurgeCacheForm } from '../purge-cache-form';
import './attention-panel.css';

const TONE: Record<AdminAttentionItem['tone'], Tone> = { danger: 'danger', warn: 'warn', info: 'accent' };
const TONE_LABEL: Record<AdminAttentionItem['tone'], string> = { danger: 'Kritiek', warn: 'Let op', info: 'Info' };

export function AttentionPanel({ orgId, items }: { orgId: string; items: AdminAttentionItem[] }) {
  const critical = items.filter((i) => i.tone === 'danger').length;
  return (
    <section className="v1-card v1-adm-attn" aria-labelledby="v1-adm-attn-title">
      <div className="v1-adm-card-head">
        <h2 id="v1-adm-attn-title" className="v1-section-title">
          Wat is er aan de hand
        </h2>
        {items.length === 0 ? (
          <Badge tone="ok" dot>
            Niets bijzonders
          </Badge>
        ) : (
          <Badge tone={critical > 0 ? 'danger' : 'warn'} dot>
            {critical > 0 ? `${critical} kritiek` : `${items.length} ${items.length === 1 ? 'punt' : 'punten'}`}
          </Badge>
        )}
      </div>

      {items.length === 0 ? (
        <p className="v1-adm-muted" style={{ margin: 0 }}>
          Geen limieten bereikt, de widget draait, geen mislukte crawls, onbeantwoorde vragen of open fouten.
        </p>
      ) : (
        <ul className="v1-list">
          {items.map((it) => (
            <li key={it.text} className="v1-list-row v1-adm-attn-row">
              <Badge tone={TONE[it.tone]} dot>
                {TONE_LABEL[it.tone]}
              </Badge>
              <span className="v1-list-main">
                <span className="v1-adm-attn-text">{it.text}</span>
              </span>
              <Link href={it.href} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                {it.action}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="v1-adm-attn-foot">
        <span className="v1-adm-muted">Klaagt de klant over een oud antwoord terwijl de kennisbank klopt?</span>
        <PurgeCacheForm orgId={orgId} compact />
      </div>
    </section>
  );
}
