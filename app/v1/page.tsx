import { redirect } from 'next/navigation';

// /v1 zelf heeft geen eigen scherm: stuur door naar de V1-login (klant/admin-keuze
// zit daar). Ingelogde users komen via de login vanzelf in /v1/app of /v1/admin.
export default function V1IndexPage() {
  redirect('/v1/login');
}
