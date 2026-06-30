import { SetPasswordForm } from './set-password-form';

// V1 M1 — de klant zet z'n eigen wachtwoord na de invite-callback (sessie staat al).
// De sessie is gezet door /v1/auth/confirm.
export const dynamic = 'force-dynamic';

export default function SetPasswordPage() {
  return <SetPasswordForm />;
}
