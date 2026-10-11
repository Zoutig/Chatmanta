// Command Center — Testklanten pipeline (PR 3).

import {
  ensureCustomersSeeded,
  listCustomers,
} from '@/lib/commandcenter/server/customers';
import { CustomersClient } from '../components/customers-client';

export const dynamic = 'force-dynamic';

export default async function CommandCenterCustomersPage() {
  await ensureCustomersSeeded();
  const customers = await listCustomers();
  return <CustomersClient customers={customers} />;
}
