import { redirect } from 'next/navigation';

/**
 * Root `/` is (nog) geen primary scherm — de V0-hub staat op `/v0/home`.
 * Tijdelijk: de marketingsite (M2) vervangt deze redirect.
 */
export default function RootRedirect(): never {
  redirect('/v0/home');
}
