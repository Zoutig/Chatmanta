// Voorbeeld: Widget (kopie van app/v1/app/widget/page.tsx). Uiterlijk en aan/uit
// leven in de browser van de bezoeker; de voorbeeldwebsite volgt ze direct.

import Link from 'next/link';
import { WIDGET_MISSING_AFTER_MS } from '@/lib/v1/dashboard/attention';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { DemoWidgetForm } from './demo-widget-form';
import { DemoStatusPill } from './demo-status-pill';
import '../preview/preview.css';
import './widget-screen.css';

const TITLE = 'Widget';
const DESCRIPTION = 'Zo ziet je chatbot eruit op je website, en zo zet je hem erop.';

export default function V1WidgetPage() {
  return (
    <div className="v1-page">
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        actions={
          <>
            <DemoStatusPill />
            <Link href="/voorbeeld/preview" className={buttonClass({ variant: 'secondary' })}>
              Bekijk chatbot
            </Link>
          </>
        }
      />
      <DemoWidgetForm origin="https://www.chatmanta.nl" missingAfterMs={WIDGET_MISSING_AFTER_MS} />
    </div>
  );
}
