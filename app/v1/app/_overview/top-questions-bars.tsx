// TopQuestionsBars (V1-fork van app/klantendashboard/components/overview/top-questions-bars).
// Identiek aan V0 — ALLEEN de "Alles ›"-href wijst naar /v1/app/*. Card/SectionHeader
// blijven import-only uit V0.

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { SectionHeader } from '@/app/klantendashboard/components/ui/section-header';
import type { KlantFaqResult } from '@/lib/v0/klantendashboard/server/top-questions';

export function TopQuestionsBars({ result }: { result: KlantFaqResult }) {
  const { items, totalUnique, pending } = result;
  const max = items.length > 0 ? items[0].count : 1;

  return (
    <Card style={{ padding: '16px 20px' }}>
      <SectionHeader
        title="Meest gestelde vragen"
        subtitle="Wat bezoekers het vaakst aan je chatbot vragen."
        right={
          <Link
            href="/v1/app/gesprekken?view=top-questions"
            style={{ fontSize: 12.5, color: 'var(--klant-accent)', textDecoration: 'none' }}
          >
            Alles ›
          </Link>
        }
      />
      {items.length === 0 ? (
        <div style={{ padding: '20px 4px', fontSize: 13, color: 'var(--klant-dim)', lineHeight: 1.5 }}>
          {pending
            ? 'De ranglijst wordt periodiek automatisch bijgewerkt — kom binnenkort terug.'
            : totalUnique === 0
              ? 'Nog geen vragen. Zodra bezoekers met je chatbot praten, zie je hier wat het vaakst gevraagd wordt.'
              : 'Nog geen vraag die de drempel haalt. Pas de drempel aan in Gesprekken → Meest gesteld.'}
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {items.map((q) => {
            const w = Math.max(4, Math.round((q.count / max) * 100));
            return (
              <li key={q.question} className="klant-bar-row">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 12,
                    marginBottom: 5,
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--klant-ink)', lineHeight: 1.3 }}>
                    {q.question}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--klant-font-mono)',
                      fontSize: 11.5,
                      color: 'var(--klant-muted)',
                      flexShrink: 0,
                    }}
                  >
                    {q.count}
                  </span>
                </div>
                <div
                  style={{
                    height: 3,
                    background: 'var(--klant-surface-muted)',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    className="klant-bar-fill"
                    style={{
                      width: `${w}%`,
                      height: '100%',
                      background:
                        q.lastStatus === 'unanswered' ? 'var(--klant-warn)' : 'var(--klant-accent)',
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
