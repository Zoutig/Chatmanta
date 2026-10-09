// Voorbeeld-dashboard: Account. Zelfde opbouw als V1, gegevens uit vaste voorbeelddata.

import { PageHeader } from '@/app/v1/_ui/page-header';
import { DEMO_ACCOUNT } from '@/lib/voorbeeld/fixtures/account';
import { AccountForm } from './account-form';

export default function VoorbeeldAccountPage() {
  return (
    <div className="v1-page v1-page--narrow">
      <PageHeader
        title="Account"
        description="Je inloggegevens, je organisatie en wat je deze maand hebt verbruikt."
      />
      <AccountForm
        email={DEMO_ACCOUNT.email}
        orgName={DEMO_ACCOUNT.orgName}
        isOwner={DEMO_ACCOUNT.isOwner}
        orgId={DEMO_ACCOUNT.orgId}
        monthly={DEMO_ACCOUNT.monthly}
        dailyBudget={DEMO_ACCOUNT.dailyBudget}
        documentsCount={DEMO_ACCOUNT.documentsCount}
      />
    </div>
  );
}
