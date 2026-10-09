// Voorbeeld: Instellingen (kopie van app/v1/app/instellingen/page.tsx). De
// instellingen leven in de browser van de bezoeker; de voorbeeldwidget volgt ze.

import Link from 'next/link';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { DemoSettingsForm } from './demo-settings-form';

export default function V1InstellingenPage() {
  return (
    <div className="v1-page">
      <PageHeader
        title="Chatbot"
        description="Hoe je chatbot heet, klinkt en antwoordt. Wijzigingen gelden direct voor nieuwe gesprekken."
        actions={
          <Link href="/voorbeeld/preview" className={buttonClass({ variant: 'secondary' })}>
            Bekijk chatbot
          </Link>
        }
      />
      <DemoSettingsForm />
    </div>
  );
}
