import { ForgotPasswordForm } from './forgot-password-form';

// V1 — "wachtwoord vergeten"-aanvraagpagina. Valt buiten de V0-demo-gate via de
// /v1-branch in proxy.ts (krijgt daar enkel sessie-refresh; geen auth vereist).
export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
