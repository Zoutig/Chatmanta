import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { StatusBadge } from './status-badge';
import { AnimatedThemeToggler } from '@/app/components/ui/animated-theme-toggler';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';

export function Topbar({
  orgName,
  chatbotStatus,
}: {
  orgName: string;
  chatbotStatus: ChatbotStatus;
}) {
  return (
    <header className="klant-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            fontSize: 13,
            color: 'var(--klant-fg-muted)',
          }}
        >
          Workspace
        </span>
        <span
          style={{
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--klant-fg)',
          }}
        >
          {orgName}
        </span>
        <StatusBadge status={chatbotStatus} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link
          href="/widget"
          className="klant-btn"
          style={{ textDecoration: 'none' }}
          title="Open de widget-demo om te zien hoe je chatbot op een website verschijnt"
        >
          <ExternalLink size={14} strokeWidth={1.7} />
          <span>Preview chatbot</span>
        </Link>
        <AnimatedThemeToggler />
      </div>
    </header>
  );
}
