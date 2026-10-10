// Vaste voorbeelddata voor de Account-pagina (Vakantiepark De Duinhoeve).
import type { QuestionVerdict } from '@/lib/v1/limits/usage-limits';
import { DEMO_ORG_NAME } from '@/lib/voorbeeld/demo-defaults';
import { DEMO_DOCUMENTS } from './kennisbank';

export const DEMO_ACCOUNT: {
  email: string;
  orgName: string;
  isOwner: boolean;
  orgId: string;
  daily: QuestionVerdict;
  monthly: QuestionVerdict;
  documentsCount: number;
} = {
  email: 'demo@duinhoeve.example',
  orgName: DEMO_ORG_NAME,
  isOwner: true,
  orgId: '6f1c2d4e-9a7b-4c3d-8e21-5b0a9d7c4f12',
  daily: { over: false, count: 38, limit: 250 },
  monthly: { over: false, count: 1240, limit: 2000 },
  documentsCount: DEMO_DOCUMENTS.length,
};
