import { V1SignInCard, type LoginMode } from './v1-sign-in-card';
import { loginErrorMessage } from './login-errors';

// Provisionele V1-route (fundament-proof). Definitieve route-/group-naam volgt bij
// de kernel-graduatie. Valt buiten de V0-demo-gate via de /v1-branch in proxy.ts.
export const dynamic = 'force-dynamic';

export default async function V1LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; as?: string }>;
}) {
  const { error, as } = await searchParams;
  // Alleen vaste teksten, nooit de ruwe ?error=-waarde (zie login-errors.ts).
  const initialError = loginErrorMessage(error);
  // ?as=admin opent de login direct in admin-modus (deelbare link voor het team).
  const initialMode: LoginMode = as === 'admin' ? 'admin' : 'klant';
  return <V1SignInCard initialError={initialError} initialMode={initialMode} />;
}
