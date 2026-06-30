import { V1SignInCard } from './v1-sign-in-card';

// Provisionele V1-route (fundament-proof). Definitieve route-/group-naam volgt bij
// de kernel-graduatie. Valt buiten de V0-demo-gate via de /v1-branch in proxy.ts.
export const dynamic = 'force-dynamic';

// De confirm-route redirect bij een mislukte invite-link naar /v1/login?error=…
const ERROR_MESSAGES: Record<string, string> = {
  missing_token: 'De activatielink is ongeldig of incompleet. Vraag een nieuwe uitnodiging aan.',
  verify_failed: 'De activatielink is verlopen of al gebruikt. Vraag een nieuwe uitnodiging aan.',
};

export default async function V1LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const initialError = error ? (ERROR_MESSAGES[error] ?? error) : undefined;
  return <V1SignInCard initialError={initialError} />;
}
