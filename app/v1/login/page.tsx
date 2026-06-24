import { V1LoginForm } from './login-form';

// Provisionele V1-route (fundament-proof). Definitieve route-/group-naam volgt bij
// de kernel-graduatie. Valt buiten de V0-demo-gate via de /v1-branch in proxy.ts.
export const dynamic = 'force-dynamic';

export default function V1LoginPage() {
  return (
    <main style={{ maxWidth: 360, margin: '12vh auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>V1 — Inloggen</h1>
      <p style={{ fontSize: 13, color: '#555', marginTop: 0, marginBottom: 20 }}>
        Toegang tot het V1-portaal (Supabase Auth).
      </p>
      <V1LoginForm />
    </main>
  );
}
