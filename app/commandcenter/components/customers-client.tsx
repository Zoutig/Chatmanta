'use client';

// CustomersClient — testklanten pipeline.
// Layout: kolommen per status (kanban-stijl) plus een view-toggle voor lijst.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  CUSTOMER_STATUSES,
  type CustomerStatus,
  type TestCustomer,
} from '@/lib/commandcenter/types';
import { CustomerStatusBadge, OwnerBadge } from './badges';
import { CustomerModal } from './customer-modal';
import { Icon } from '@/app/components/svg-icons';

type Props = {
  customers: TestCustomer[];
};

export function CustomersClient({ customers }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<TestCustomer | null>(null);
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [defaultStatus, setDefaultStatus] = useState<CustomerStatus | undefined>(
    undefined,
  );
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');

  function openCreate(status?: CustomerStatus) {
    setEditing(null);
    setDefaultStatus(status);
    setMode('create');
  }
  function openEdit(c: TestCustomer) {
    setEditing(c);
    setMode('edit');
  }
  function close() {
    setMode('closed');
    setEditing(null);
    setDefaultStatus(undefined);
  }
  function onSaved() {
    router.refresh();
  }

  const byStatus: Record<CustomerStatus, TestCustomer[]> = Object.fromEntries(
    CUSTOMER_STATUSES.map((s) => [s, [] as TestCustomer[]]),
  ) as Record<CustomerStatus, TestCustomer[]>;
  for (const c of customers) byStatus[c.status].push(c);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 700,
              fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
              letterSpacing: '-0.02em',
              background: 'linear-gradient(180deg, #f3fbff 0%, #b8dfe9 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Testklanten pipeline
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(207,232,240,0.62)' }}>
            Van eerste idee tot betaalde klant. Niels = outreach, Sebastiaan =
            tech-demo, Samen = gesprekken / beslissingen.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              gap: 0,
              border: '1px solid rgba(120,200,230,0.18)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {(['pipeline', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  background:
                    view === v
                      ? 'color-mix(in oklab, var(--manta-accent) 16%, transparent)'
                      : 'transparent',
                  border: 'none',
                  color: view === v ? '#eaf6fb' : 'rgba(207,232,240,0.68)',
                  padding: '7px 14px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {v === 'pipeline' ? 'Pipeline' : 'Lijst'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => openCreate()}
            style={{
              background: 'var(--manta-accent)',
              border: '1px solid color-mix(in oklab, var(--manta-accent) 50%, transparent)',
              color: '#03171a',
              padding: '10px 16px',
              borderRadius: 12,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="plus" size={14} />
            Nieuwe klant
          </button>
        </div>
      </header>

      {view === 'pipeline' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          {CUSTOMER_STATUSES.map((s) => {
            const items = byStatus[s];
            return (
              <section
                key={s}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(120,200,230,0.10)',
                  borderRadius: 14,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  minHeight: 180,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <CustomerStatusBadge status={s} />
                  <span
                    style={{
                      fontSize: 11,
                      color: 'rgba(207,232,240,0.55)',
                      fontWeight: 500,
                    }}
                  >
                    {items.length}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openEdit(c)}
                      style={{
                        textAlign: 'left',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(120,200,230,0.10)',
                        borderRadius: 10,
                        padding: 10,
                        cursor: 'pointer',
                        color: '#eaf6fb',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                        }}
                      >
                        {c.companyName}
                      </div>
                      {c.contactPerson && (
                        <div style={{ fontSize: 12, color: 'rgba(207,232,240,0.62)' }}>
                          {c.contactPerson}
                        </div>
                      )}
                      {c.nextAction && (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: 'rgba(155,213,224,0.7)',
                            fontStyle: 'italic',
                          }}
                        >
                          → {c.nextAction}
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                          marginTop: 2,
                        }}
                      >
                        <OwnerBadge owner={c.owner} />
                        {c.caseStudyPotential && (
                          <span
                            style={{
                              fontSize: 10,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              color: '#f0d39a',
                              background: 'rgba(230,180,90,0.10)',
                              border: '1px solid rgba(230,180,90,0.30)',
                              borderRadius: 999,
                              padding: '1px 6px',
                            }}
                          >
                            Case study
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => openCreate(s)}
                    style={{
                      background: 'transparent',
                      border: '1px dashed rgba(120,200,230,0.20)',
                      borderRadius: 10,
                      padding: '6px 10px',
                      fontSize: 12,
                      color: 'rgba(155,213,224,0.6)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon name="plus" size={11} />
                    Toevoegen
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {customers.length === 0 ? (
            <div
              style={{
                border: '1px dashed rgba(120,200,230,0.18)',
                borderRadius: 16,
                padding: 32,
                color: 'rgba(207,232,240,0.55)',
                fontSize: 14,
                textAlign: 'center',
              }}
            >
              Nog geen klanten in de pipeline.
            </div>
          ) : (
            customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openEdit(c)}
                style={{
                  textAlign: 'left',
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(120,200,230,0.12)',
                  borderRadius: 12,
                  padding: 14,
                  cursor: 'pointer',
                  color: '#eaf6fb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div
                    style={{
                      fontSize: 14.5,
                      fontWeight: 600,
                      fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                    }}
                  >
                    {c.companyName}
                    {c.companyType && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          fontWeight: 400,
                          color: 'rgba(207,232,240,0.55)',
                        }}
                      >
                        · {c.companyType}
                      </span>
                    )}
                  </div>
                  {c.nextAction && (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'rgba(155,213,224,0.7)',
                        fontStyle: 'italic',
                      }}
                    >
                      → {c.nextAction}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CustomerStatusBadge status={c.status} />
                  <OwnerBadge owner={c.owner} />
                  {c.lastContactDate && (
                    <span style={{ fontSize: 11, color: 'rgba(207,232,240,0.5)' }}>
                      Laatst: {c.lastContactDate}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      <CustomerModal
        key={editing?.id ?? `new-${defaultStatus ?? 'default'}`}
        open={mode !== 'closed'}
        customer={editing}
        defaultStatus={defaultStatus}
        onClose={close}
        onSaved={onSaved}
      />
    </div>
  );
}
