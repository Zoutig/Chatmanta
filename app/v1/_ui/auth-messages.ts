// Supabase Auth geeft Engelse foutteksten terug. Dit vertaalt de bekende
// gevallen naar Nederlands; onbekende teksten gaan ongewijzigd door.
const EXACT: Record<string, string> = {
  'Invalid login credentials': 'E-mailadres of wachtwoord klopt niet.',
  'Email not confirmed': 'Je e-mailadres is nog niet bevestigd. Kijk in je inbox.',
};

export function authErrorMessage(raw: string): string {
  if (EXACT[raw]) return EXACT[raw];
  if (/rate limit|too many/i.test(raw)) return 'Te veel pogingen. Wacht even en probeer het opnieuw.';
  if (/session missing|session not found|expired/i.test(raw)) {
    return 'Je link is verlopen. Vraag een nieuwe link aan.';
  }
  if (/different from the old/i.test(raw)) return 'Kies een ander wachtwoord dan je huidige.';
  return raw;
}
