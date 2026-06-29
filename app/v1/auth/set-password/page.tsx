import { SetPasswordForm } from './set-password-form';

// V1 M1 — de klant zet z'n eigen wachtwoord na de invite-callback (sessie staat al).
// Minimale inline-styled UI; de sessie is gezet door /v1/auth/callback.
export const dynamic = 'force-dynamic';

export default function SetPasswordPage() {
  return (
    <main style={{ maxWidth: 360, margin: '12vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Stel je wachtwoord in</h1>
      <p style={{ fontSize: 13, color: '#555', marginTop: 0, marginBottom: 20 }}>
        Kies een wachtwoord om je account te activeren.
      </p>
      <SetPasswordForm />
    </main>
  );
}
