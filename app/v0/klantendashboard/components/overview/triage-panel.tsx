// TriagePanel — de hoofdrol van Overzicht: onbeantwoorde vragen + directe
// acties. Server-component. Bij 0 onbeantwoord toont hij een geruststellende
// "alles afgehandeld"-staat i.p.v. de waarschuwings-hero.
//
// query_log heeft geen thread_id, dus "Bekijk gesprek" linkt naar de
// gefilterde gesprekkenlijst i.p.v. een specifieke thread; "Antwoord toevoegen"
// stuurt naar de kennisbank waar je een Q&A toevoegt.

import { Btn } from '../ui/btn';
import { Icon } from '../ui/icons';
import type { UnansweredQuestion } from '@/lib/v0/klantendashboard/types';

const UNANSWERED_HREF = '/klantendashboard/gesprekken?filter=unanswered';
const ADD_KNOWLEDGE_HREF = '/klantendashboard/kennisbank';

function relTimeNl(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const min = Math.floor((Date.now() - then) / 60000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} uur geleden`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'gisteren';
  if (day < 7) return `${day} dagen geleden`;
  const wk = Math.floor(day / 7);
  if (wk <= 1) return '1 week geleden';
  if (wk < 5) return `${wk} weken geleden`;
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export function TriagePanel({
  items,
  total,
}: {
  items: UnansweredQuestion[];
  /** Totaal aantal onbeantwoorde vragen (30 dagen) — voor de kop + knop. */
  total: number;
}) {
  if (total === 0 || items.length === 0) {
    return (
      <section className="klant-triage" style={{ padding: 'var(--klant-pad-y) var(--klant-pad-x)' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'var(--klant-success-soft)',
              color: 'var(--klant-success)',
              border: '1px solid var(--klant-success-border)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name="check" size={18} strokeWidth={2.4} />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--klant-font-display)',
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--klant-ink)',
              }}
            >
              Alle vragen zijn beantwoord
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--klant-muted)', marginTop: 2 }}>
              Zodra een bezoeker iets vraagt waar je chatbot geen antwoord op heeft, verschijnt het
              hier om snel op te lossen.
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="klant-triage">
      {/* Kop-band */}
      <header
        style={{
          position: 'relative',
          padding: '14px 20px',
          borderBottom: '1px solid var(--klant-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--klant-warn-soft)',
            color: 'var(--klant-warn)',
            border: '1px solid var(--klant-warn-border)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="alert" size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              fontFamily: 'var(--klant-font-display)',
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--klant-ink)',
            }}
          >
            {total === 1
              ? '1 vraag wacht op een antwoord'
              : `${total} vragen wachten op een antwoord`}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--klant-muted)', marginTop: 2 }}>
            Voeg kennis toe — je chatbot beantwoordt vergelijkbare vragen vanaf het volgende gesprek.
          </div>
        </div>
        <Btn
          href={UNANSWERED_HREF}
          variant="soft"
          size="md"
          trailingIcon={<Icon name="arrow-right" size={12} />}
        >
          {total > items.length ? `Alle ${total} onbeantwoorde` : 'Bekijk alle'}
        </Btn>
      </header>

      {/* Rijen */}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative' }}>
        {items.map((u, i) => (
          <li
            key={u.queryLogId ?? u.question}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '13px 20px',
              borderTop: i ? '1px solid var(--klant-border)' : 'none',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--klant-font-mono)',
                fontSize: 11,
                color: 'var(--klant-dim)',
                letterSpacing: '0.04em',
                width: 22,
                flexShrink: 0,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 14, color: 'var(--klant-ink)', lineHeight: 1.35 }}>{u.question}</div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontFamily: 'var(--klant-font-mono)',
                    fontSize: 11.5,
                    color: 'var(--klant-muted)',
                  }}
                >
                  {u.occurrences}× gesteld
                </span>
                {u.lastSeenAt && (
                  <span style={{ fontSize: 11.5, color: 'var(--klant-dim)' }}>
                    laatst {relTimeNl(u.lastSeenAt)}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Btn href={UNANSWERED_HREF} variant="ghost" size="sm" style={{ border: '1px solid var(--klant-border)' }}>
                Bekijk gesprek
              </Btn>
              <Btn
                href={ADD_KNOWLEDGE_HREF}
                variant="primary"
                size="sm"
                trailingIcon={<Icon name="arrow-right" size={11} />}
              >
                Antwoord toevoegen
              </Btn>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
