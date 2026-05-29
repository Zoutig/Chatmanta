'use client';

// Herbruikbare React error boundary die render-crashes vangt en naar
// /api/v0/client-error rapporteert. window.onerror/unhandledrejection vangen GEEN
// React-render-fouten — daarvoor is deze boundary nodig. Toont een optionele
// fallback (default: niets, zodat de widget stilletjes leeg blijft i.p.v. de
// hele host-pagina te breken).

import { Component, type ReactNode } from 'react';

import { reportClientError } from './report-client-error';

type Props = {
  surface: 'widget' | 'dashboard';
  fallback?: ReactNode;
  children: ReactNode;
  /** Widget: doorgegeven zodat een render-crash met embed-token kan rapporteren. */
  orgSlug?: string;
  embedToken?: string;
};

type State = { hasError: boolean };

export class ClientErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportClientError({
      surface: this.props.surface,
      message: error.message || 'render error',
      stack: error.stack ?? info.componentStack ?? undefined,
      code: 'CLIENT_JS',
      orgSlug: this.props.orgSlug,
      embedToken: this.props.embedToken,
    });
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
