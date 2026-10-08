import type { ReactNode } from 'react';
import { BrandMark } from './brand-mark';

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="v1-auth">
      <div className="v1-auth-card">
        <div className="v1-auth-brand">
          <BrandMark />
          ChatManta
        </div>
        <div>
          <h1 className="v1-auth-title">{title}</h1>
          {subtitle ? <p className="v1-auth-sub">{subtitle}</p> : null}
        </div>
        {children}
        {footer ? <div className="v1-auth-foot">{footer}</div> : null}
      </div>
    </main>
  );
}
