// Vaste voorbeelddata voor de Account-pagina (Vakantiepark De Duinhoeve).
import type { MonthlyVerdict, BudgetVerdict } from '@/lib/v1/limits/usage-limits';
import { DEMO_ORG_NAME } from '@/lib/voorbeeld/demo-defaults';
import { DEMO_DOCUMENTS } from './kennisbank';

export const DEMO_ACCOUNT: {
  email: string;
  orgName: string;
  isOwner: boolean;
  orgId: string;
  monthly: MonthlyVerdict;
  dailyBudget: BudgetVerdict;
  documentsCount: number;
} = {
  email: 'demo@duinhoeve.example',
  orgName: DEMO_ORG_NAME,
  isOwner: true,
  orgId: '6f1c2d4e-9a7b-4c3d-8e21-5b0a9d7c4f12',
  monthly: { over: false, count: 1240, limit: 5000 },
  dailyBudget: { over: false, spentEur: 0.42, capEur: 5 },
  documentsCount: DEMO_DOCUMENTS.length,
};
