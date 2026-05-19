export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="klant-page-header">
      <div style={{ minWidth: 0 }}>
        <h1 className="klant-page-title">{title}</h1>
        {subtitle && <p className="klant-page-sub">{subtitle}</p>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
