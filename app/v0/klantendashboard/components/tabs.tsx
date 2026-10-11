import Link from 'next/link';

export type TabDef = { key: string; label: string; count?: number };

export function TabsNav({
  tabs,
  active,
  basePath,
  paramName = 'tab',
}: {
  tabs: TabDef[];
  active: string;
  basePath: string;
  paramName?: string;
}) {
  return (
    <nav className="klant-tabs" role="tablist" aria-label="Bron-typen">
      {tabs.map((t) => {
        const href = t.key === tabs[0].key ? basePath : `${basePath}?${paramName}=${t.key}`;
        return (
          <Link
            key={t.key}
            href={href}
            className="klant-tab"
            data-active={active === t.key}
            role="tab"
            aria-selected={active === t.key}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  padding: '1px 7px',
                  borderRadius: 999,
                  background: active === t.key ? 'var(--klant-accent-soft)' : 'var(--klant-surface)',
                  color: active === t.key ? 'var(--klant-accent)' : 'var(--klant-fg-muted)',
                  fontWeight: 500,
                }}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
