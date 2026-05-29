// Admin Dashboard — globale "Gesprekken" is verwijderd uit de navigatie: gesprekken
// zijn voortaan alléén per klant toegankelijk (klantdetail → tab Gesprekken).
// Deze route blijft bestaan als redirect zodat oude bookmarks/links niet 404'en.

import { redirect } from 'next/navigation';

export default function GesprekkenRedirect() {
  redirect('/admindashboard/klanten');
}
