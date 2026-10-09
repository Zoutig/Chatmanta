// Voorbeeld: Preview (kopie van app/v1/app/preview/page.tsx). De widget gebruikt
// de instellingen uit de browser van de bezoeker en praat met de demo-chat.

import Link from 'next/link';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { DEMO_SITE_PATH } from '@/lib/voorbeeld/demo-defaults';
import { PreviewFrame } from './preview-frame';
import { DemoPreviewWidget } from './demo-preview-widget';
import './preview.css';

export default function V1PreviewPage() {
  return (
    <div className="v1-page">
      <PageHeader
        title="Test je chatbot"
        description="Stel een vraag en zie precies wat je bezoekers te zien krijgen."
        actions={
          <>
            <Link href="/voorbeeld/widget" className={buttonClass({ variant: 'secondary' })}>
              Naar Widget
            </Link>
            <Link href={DEMO_SITE_PATH} className={buttonClass({ variant: 'primary' })}>
              Op de voorbeeldwebsite
            </Link>
          </>
        }
      />
      <PreviewFrame address="duinhoeve.example">
        <DemoPreviewWidget />
      </PreviewFrame>
    </div>
  );
}
